import csv
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from database import SessionLocal, FMCGSku, init_db
import os
import sys

# We use BGE-small as the open-source embedding model as recommended in architecture
MODEL_NAME = "BAAI/bge-small-en-v1.5"
FAISS_INDEX_PATH = "fmcg_bge_index.faiss"

def load_data(csv_path: str):
    init_db()
    db = SessionLocal()
    
    # Check if data already exists
    if db.query(FMCGSku).count() > 0:
        print("Database already populated. Skipping reload.")
        db.close()
        return

    print(f"Loading data from {csv_path}...")
    
    skus_to_insert = []
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            item = FMCGSku(
                brand=row['Brand'],
                sku=row['SKU'],
                category=row['Category'],
                packaging=row['Typical_Packaging'],
                colors=row['Primary_Color_Cues'],
                barcode=row['Indicative_Barcode']
            )
            skus_to_insert.append(item)
            
    db.add_all(skus_to_insert)
    db.commit()
    print(f"Successfully inserted {len(skus_to_insert)} records into PostgreSQL.")
    db.close()

def build_faiss_index():
    if os.path.exists(FAISS_INDEX_PATH):
        print(f"FAISS index already exists at {FAISS_INDEX_PATH}. Skipping build.")
        return

    db = SessionLocal()
    skus = db.query(FMCGSku).order_by(FMCGSku.id).all()
    
    if not skus:
        print("No SKUs found in database to index.")
        db.close()
        return

    print(f"Loading Embedding Model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    
    texts_to_embed = []
    for item in skus:
        # A rich semantic string combining Brand, SKU, and Category for embedding search
        text_payload = f"{item.brand} {item.sku} {item.category}"
        texts_to_embed.append(text_payload)
        
    print(f"Generating embeddings for {len(texts_to_embed)} items...")
    embeddings = model.encode(texts_to_embed, normalize_embeddings=True)
    
    embedding_dim = embeddings.shape[1]
    
    # We use inner product (cosine similarity since embeddings are normalized)
    index = faiss.IndexFlatIP(embedding_dim)
    index.add(embeddings.astype("float32"))
    
    faiss.write_index(index, FAISS_INDEX_PATH)
    print(f"FAISS index built and saved to {FAISS_INDEX_PATH}.")
    
    db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Provide the absolute path to the CSV file.")
        sys.exit(1)
        
    csv_file_path = sys.argv[1]
    if not os.path.exists(csv_file_path):
        print(f"CSV file not found: {csv_file_path}")
        sys.exit(1)
        
    load_data(csv_file_path)
    build_faiss_index()
