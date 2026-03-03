import torch
from transformers import DetrImageProcessor, AutoModelForObjectDetection
import requests
from PIL import Image
from io import BytesIO

class RFDetrDetector:
    def __init__(self, model_v="SenseTime/deformable-detr"):
        # We will use Deformable DETR or RF-DETR specifically based on availability
        # Note: If migrating to pure RT-DETR, use 'PekingU/rtdetr_r50vd' 
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.processor = DetrImageProcessor.extend_from_pretrained(model_v) if "deformable" not in model_v else DetrImageProcessor.from_pretrained(model_v)
        self.model = AutoModelForObjectDetection.from_pretrained(model_v).to(self.device)
        self.CONFIDENCE_THRESHOLD = 0.4
        print(f"Loaded {model_v} on {self.device}")

    def download_image(self, url: str) -> Image.Image:
        response = requests.get(url)
        response.raise_for_status()
        return Image.open(BytesIO(response.content)).convert("RGB")

    def run_inference(self, image: Image.Image):
        # Prepare image for the model
        inputs = self.processor(images=image, return_tensors="pt").to(self.device)

        # Forward pass
        with torch.no_grad():
            outputs = self.model(**inputs)

        # Convert outputs (bounding boxes and logits) to scaled bounding boxes
        target_sizes = torch.tensor([image.size[::-1]]).to(self.device)
        results = self.processor.post_process_object_detection(outputs, target_sizes=target_sizes, threshold=self.CONFIDENCE_THRESHOLD)[0]

        detections = []
        for score, label, box in zip(results["scores"], results["labels"], results["boxes"]):
            # Remap labels using model config 
            class_name = self.model.config.id2label[label.item()]
            
            # Map COCO labels (like 'bottle', 'cup') to GRAVI expected FMCG labels
            mapped_label = self._map_to_fmcg(class_name)

            if mapped_label:
                box_list = [round(float(i), 2) for i in box.tolist()] # [ymin, xmin, ymax, xmax] mapped later
                
                detections.append({
                    "label": mapped_label,
                    "confidence": round(score.item(), 3),
                    "bbox": box_list
                })

        return detections

    def _map_to_fmcg(self, coco_label: str) -> str:
        # Phase 1 simple remapping strategy
        mapping = {
            "bottle": "bottle",
            "cup": "can",
            "refrigerator": "refrigerator",
            "bowl": "product_packaging",
            "book": "product_packaging" # Often matches flat packets/boxes
        }
        return mapping.get(coco_label, coco_label)

# Singleton instance
detector = None

def get_detector():
    global detector
    if detector is None:
        # Swap this string to PekingU/rtdetr_r50vd for the RT-DETR checkpoints on HuggingFace 
        # But 'SenseTime/deformable-detr' is highly mature for dense detection out-of-the-box
        detector = RFDetrDetector("SenseTime/deformable-detr")
    return detector
