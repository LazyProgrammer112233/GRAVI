from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import vision
import engine
import llm

app = FastAPI(title="GRAVI Final Architecture - Phase 2 API")

class ImageRequest(BaseModel):
    image_url: str

class ClassificationResponse(BaseModel):
    brand: str
    sku: str
    confidence: int
    reasoning: str
    candidates_ranked: list
    vision_extraction_metadata: dict

@app.post("/classify", response_model=ClassificationResponse)
async def classify_product(req: ImageRequest):
    try:
        # Step 1: Execute visual processing using deployed models
        vision_data = vision.analyze_image(req.image_url)
        
        # Step 2: Route through Candidate Engine to drop hallucination risks
        candidate_eng = engine.get_candidate_engine()
        top_candidates = candidate_eng.get_top_5_candidates(vision_data)
        
        # Step 3: Run strict classification inside local LLM
        scout = llm.get_llm()
        final_prediction = scout.classify(top_candidates, vision_data)
        
        # Step 4: Construct verified output
        return ClassificationResponse(
            brand=final_prediction.get("brand", "unknown"),
            sku=final_prediction.get("sku", "unknown"),
            confidence=final_prediction.get("confidence", 0),
            reasoning=final_prediction.get("reasoning", ""),
            candidates_ranked=top_candidates,
            vision_extraction_metadata=vision_data
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Use standard 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
