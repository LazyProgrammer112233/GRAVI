from thefuzz import fuzz
from thefuzz import process
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from database import SessionLocal, FMCGSku
import os

# The same BGE-small embedding model
MODEL_NAME = "BAAI/bge-small-en-v1.5"
FAISS_INDEX_PATH = "fmcg_bge_index.faiss"

class CandidateEngine:
    def __init__(self):
        self.db = SessionLocal()
        # Pre-load all SKUs into memory for fast fuzzy matching
        self.all_skus = self.db.query(FMCGSku).all()
        
        self.model = SentenceTransformer(MODEL_NAME)
        
        if os.path.exists(FAISS_INDEX_PATH):
            self.index = faiss.read_index(FAISS_INDEX_PATH)
            print("Candidate Engine loaded FAISS index.")
        else:
            self.index = None
            print("WARNING: FAISS index not found. Please run loader.py.")

    def get_top_5_candidates(self, vision_data: dict):
        """
        Step A — OCR Fuzzy Match
        Step B — Vector Similarity
        Step C — Packaging Filter
        Step D — Barcode Filter
        Returns Top 5 SKUs
        """
        ocr_text = vision_data.get("ocr_text", "")
        detected_packaging = vision_data.get("packaging_type", "")
        
        candidates = []
        
        # Vector Similarity Pass
        if self.index and ocr_text:
            text_embedding = self.model.encode([ocr_text], normalize_embeddings=True)
            text_embedding = text_embedding.astype("float32")
            
            # Search top 20 nearest neighbors first
            distances, indices = self.index.search(text_embedding, 20)
            
            for idx, internal_id in enumerate(indices[0]):
                if internal_id == -1: continue
                # Fetch SKU by index mapping (Assuming ID aligns with Faiss index for simplicity)
                # In production, maintain a clear mapping dictionary between Index ID and PostgreSQL ID.
                # Since we ordered by ID in loader.py, index `internal_id` roughly corresponds to `skus[internal_id]`
                if internal_id < len(self.all_skus):
                    sku = self.all_skus[internal_id]
                    candidates.append({
                        "sku_obj": sku,
                        "vector_score": float(distances[0][idx])
                    })
                    
        # If no FAISS or empty, fallback to pure Fuzzy
        if not candidates:
            # We just dump all in there with a vector score of 0
            for sku in self.all_skus:
                candidates.append({"sku_obj": sku, "vector_score": 0.0})
                
        # SCORING STRATEGY
        # final_score = 0.40 * ocr_similarity + 0.20 * brand_match + 0.15 * packaging_match + 0.15 * color_match + 0.10 * barcode_match
        
        scored_candidates = []
        for c in candidates:
            sku = c["sku_obj"]
            vector_score = c["vector_score"]
            
            # Construct a target string from the DB row for fuzzy match
            target_str = f"{sku.brand} {sku.sku}"
            
            # Step A: OCR Similarity (0 to 1 scale)
            ocr_similarity = fuzz.token_sort_ratio(ocr_text.lower(), target_str.lower()) / 100.0
            
            # Brand match (Is the brand explicitly in the OCR?)
            brand_match = 1.0 if sku.brand.lower() in ocr_text.lower() else 0.0
            
            # Step C: Packaging match
            packaging_match_score = 0.0
            if detected_packaging and sku.packaging:
                if detected_packaging.lower() in sku.packaging.lower():
                    packaging_match_score = 1.0
            else:
                packaging_match_score = 0.5 # Neutral if not specified
                
            color_match = 0.5 # Unused in this mock logic but available
            barcode_match = 0.0
            if vision_data.get("barcode") and sku.barcode and vision_data["barcode"] in sku.barcode:
                barcode_match = 1.0
                
            final_score = (0.40 * ocr_similarity) + (0.20 * brand_match) + (0.15 * packaging_match_score) + (0.15 * color_match) + (0.10 * barcode_match)   
            
            # Integrate the semantic vector score boost
            final_score += (vector_score * 0.2) # Max of +0.2 boost
            
            # Very basic packaging hard-filtering: 
            # If vision says "Bottle" but DB says "Wrapper" strictly, heavily penalize it.
            if detected_packaging.lower() == "bottle" and "wrapper" in sku.packaging.lower() and "bottle" not in sku.packaging.lower():
                final_score *= 0.1 # Nuke score
            
            scored_candidates.append({
                "brand": sku.brand,
                "sku": sku.sku,
                "category": sku.category,
                "confidence_score": round(final_score * 100, 2)
            })
            
        # Sort by best score descending
        scored_candidates = sorted(scored_candidates, key=lambda x: x["confidence_score"], reverse=True)
        
        # Step D: Return Top 5 Only
        return scored_candidates[:5]

engine_instance = None

def get_candidate_engine():
    global engine_instance
    if engine_instance is None:
        engine_instance = CandidateEngine()
    return engine_instance
