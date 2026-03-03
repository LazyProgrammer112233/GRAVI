import uuid
from typing import List, Dict, Any
from .detector import get_detector

def compute_authenticity_score(
    product_count: int, 
    shelf_density: float, 
    category_diversity: int, 
    image_count: int
) -> float:
    # Configurable Weights for Intelligence Aggregator
    WEIGHT_PRODUCT = 0.35
    WEIGHT_DENSITY = 0.30
    WEIGHT_DIVERSITY = 0.20
    WEIGHT_IMAGES = 0.15

    # Normalize metrics to 0-100 scale
    score_pc = min(100.0, (product_count / 50.0) * 100) 
    score_sd = min(100.0, (shelf_density / 10.0) * 100)
    score_cd = min(100.0, (category_diversity / 5.0) * 100)
    score_ic = min(100.0, (image_count / 5.0) * 100)

    total_score = float(
        (score_pc * WEIGHT_PRODUCT) +
        (score_sd * WEIGHT_DENSITY) +
        (score_cd * WEIGHT_DIVERSITY) +
        (score_ic * WEIGHT_IMAGES)
    )
    return round(total_score, 1)

def build_response(place_id: str, results: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_products = 0
    product_counts_by_category: Dict[str, int] = {}
    
    for res in results:
        for det in res.get("detections", []):
            total_products = total_products + 1
            cat = det["label"]
            product_counts_by_category[cat] = product_counts_by_category.get(cat, 0) + 1

    unique_categories = len(product_counts_by_category)
    total_images = len(results)
    
    # Store intelligence heuristics
    store_type_prediction = "STOREFRONT" if total_products == 0 else "Low Inventory Retail"
    if total_products > 15 and unique_categories >= 3:
        store_type_prediction = "General FMCG Retail"
    elif total_products > 50:
        store_type_prediction = "High Density Supermarket"

    if total_products == 0:
        inventory_density = "EMPTY_SHELF"
    elif total_products < 3:
        inventory_density = "LOW_INVENTORY"
    else:
        inventory_density = round(total_products / max(1, total_images), 2)

    auth_score = compute_authenticity_score(
        total_products, 
        inventory_density if isinstance(inventory_density, float) else 0.0, 
        unique_categories, 
        total_images
    )

    return {
        "analysis_session_id": str(uuid.uuid4()),
        "pipeline_version": "v5.0-RF-DETR-SelfHosted",
        "place_id": place_id,
        "total_images_analyzed": total_images,
        "total_products_detected": total_products,
        "product_counts_by_category": product_counts_by_category,
        "store_type_prediction": store_type_prediction,
        "inventory_density_score": inventory_density,
        "authenticity_score": auth_score,
        "raw_results": results
    }
