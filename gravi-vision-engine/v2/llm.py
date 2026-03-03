import os
import requests
import json

# Local vLLM or llama.cpp endpoint format
LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "http://localhost:11434/v1/chat/completions") # Ollama/llama.cpp compatible
MODEL_NAME = os.getenv("MODEL_NAME", "llama-4-scout-gguf") # Local scout model string

class LocalLLMScout:
    def __init__(self):
        print(f"Instantiated Local LLaMA 4 Scout connected to {LLM_ENDPOINT}")
        
    def classify(self, candidates: list, vision_data: dict) -> dict:
        """
        Passes the extracted vision data and top 5 closest candidate SKUs 
        into the LLM strictly instructing it to select the best match or fail "unknown"
        """
        
        # Format candidate string
        candidate_text = ""
        for idx, c in enumerate(candidates, 1):
            candidate_text += f"{idx}. {c.get('brand')} - {c.get('sku')}\n"
            
        system_prompt = f"""You are a strict FMCG classifier.

You must choose ONLY from the provided candidate list.
Never invent new brands.

Candidate SKUs:
{candidate_text}

Image Extracted Data:
OCR Text: "{vision_data.get('ocr_text', '')}"
Dominant Colors: "{','.join(vision_data.get('dominant_colors', []))}"
Packaging: "{vision_data.get('packaging_type', '')}"
Barcode: "{vision_data.get('barcode', '')}"

Choose the best match strictly from the Candidate SKUs.
If none match strongly, return EXACTLY:
{{
  "brand": "unknown",
  "sku": "unknown",
  "confidence": 0,
  "reasoning": "insufficient evidence"
}}

Respond ONLY in valid, parsable JSON format matching this schema:
{{
  "brand": "<chosen_brand>",
  "sku": "<chosen_sku>",
  "confidence": <integer between 1-100 indicating match certainty>,
  "reasoning": "<short one sentence justification referencing OCR or color>"
}}"""

        payload = {
            "model": MODEL_NAME,
            "messages": [
                {"role": "system", "content": "You are a specialized retail AI. Return strictly JSON."},
                {"role": "user", "content": system_prompt}
            ],
            "temperature": 0.1, # Extremely low temp for deterministic lookup
            "response_format": {"type": "json_object"} # Force JSON structured generation
        }
        
        try:
            # We mock the response for seamless testing if no server is running, 
            # otherwise we execute the POST to the actual local gpu endpoint
            response = requests.post(LLM_ENDPOINT, json=payload, headers={"Content-Type": "application/json"}, timeout=15)
            response.raise_for_status()
            
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            
            return json.loads(content)
            
        except requests.exceptions.ConnectionError:
            print("WARNING: Local LLM Endpoint Offline. Generating heuristic mock response based on Candidates...")
            # Fallback mock for demonstration if LLM container is off
            if candidates:
                top = candidates[0]
                return {
                    "brand": top.get("brand"),
                    "sku": top.get("sku"),
                    "confidence": int(top.get("confidence_score", 0)),
                    "reasoning": f"Local LLM offline. System fell back to Highest candidate Engine Match {top.get('confidence_score')}%"
                }
            return {
                "brand": "unknown",
                "sku": "unknown",
                "confidence": 0,
                "reasoning": "Local LLM offline and no candidates discovered."
            }
        except Exception as e:
                return {
                    "brand": "error",
                    "sku": "error",
                    "confidence": 0,
                    "reasoning": str(e)
                }

scout = None

def get_llm():
    global scout
    if scout is None:
        scout = LocalLLMScout()
    return scout
