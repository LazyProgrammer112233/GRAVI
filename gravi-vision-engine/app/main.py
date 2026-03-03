from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import uvicorn
import asyncio
from concurrent.futures import ThreadPoolExecutor

from .detector import get_detector
from .aggregator import build_response

app = FastAPI(title="GRAVI Vision Engine", version="5.0", description="Self-hosted RF-DETR object detection microservice for retail shelves")

# Allow CORS for the frontend (React on localhost:5173 or Vercel)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Initialize ThreadPool for CPU-bound image downloading/preprocessing
executor = ThreadPoolExecutor(max_workers=10)

class AnalyzeRequest(BaseModel):
    place_id: str
    image_urls: List[str]

@app.on_event("startup")
def load_model():
    # Pre-warm the model into VRAM
    get_detector()

@app.get("/health")
def health_check():
    return {"status": "ok", "model": "rf-detr"}

def process_single_image(url: str, img_id: int) -> Dict[str, Any]:
    detector = get_detector()
    try:
        # Download
        image = detector.download_image(url)
        # Infer
        detections = detector.run_inference(image)
        return {
            "image_id": img_id,
            "url": url,
            "status": "success",
            "detections": detections
        }
    except Exception as e:
        print(f"Failed to process {url}: {e}")
        return {
            "image_id": img_id,
            "url": url,
            "status": "failed",
            "error": str(e)
        }

@app.post("/analyze-images")
async def analyze_images(req: AnalyzeRequest):
    if not req.image_urls:
        raise HTTPException(status_code=400, detail="No image URLs provided")
    
    # Run the bounded sync PyTorch logic in an async loop via threadpool
    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(executor, process_single_image, url, idx)
        for idx, url in enumerate(req.image_urls)
    ]
    
    # Wait for all image detections
    results = await asyncio.gather(*tasks)
    
    # Aggregate Intelligence
    final_output = build_response(req.place_id, dict(enumerate(results)).values())
    
    return final_output

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
