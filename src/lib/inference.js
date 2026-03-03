export const REPLICATE_API_URL = "/api/replicate/v1/predictions";

export const V3_PROMPT = `You are a retail audit engine.
Analyze the image and identify ONLY clearly visible FMCG products.

Rules:
- Do NOT guess brand names.
- If brand text is not clearly readable, return "Unknown".
- Do NOT hallucinate products.
- Only include products physically visible.
- Maximum 25 products.
- Output STRICT JSON.
- No explanations.

Return format:
{
  "products": [
    {
      "brand": "",
      "product_name": "",
      "category": "",
      "confidence": 0-100,
      "reason": ""
    }
  ]
}`;

export async function fetchInternVL2Analysis(base64Image, replicateToken) {
    if (!replicateToken) {
        throw new Error("Replicate API token is required for Bring-Your-Own-Key configuration.");
    }

    const payload = {
        version: "80537f9eead1a5bfa72d5ac6ea6414379be41d4d4f6679fd776e9535d1eb58bb",
        input: {
            image: base64Image,
            prompt: V3_PROMPT,
            temperature: 0.1, // Deterministic
        }
    };

    const response = await fetch(REPLICATE_API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${replicateToken}`,
            "Content-Type": "application/json",
            "Prefer": "wait" // Replicate prefers 'wait' for synchronous response if supported, otherwise polling
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Replicate API HTTP Error: ${response.status} - ${await response.text()}`);
    }

    let prediction = await response.json();

    // Poll if prediction is not finished immediately
    while (prediction.status !== "succeeded" && prediction.status !== "failed") {
        await new Promise(r => setTimeout(r, 2000));

        // Proxy the polling URL as well to avoid CORS
        const pollUrl = prediction.urls.get.replace('https://api.replicate.com', '/api/replicate');

        const pollResponse = await fetch(pollUrl, {
            headers: {
                "Authorization": `Bearer ${replicateToken}`,
                "Content-Type": "application/json"
            }
        });
        prediction = await pollResponse.json();
    }

    if (prediction.status === "failed") {
        throw new Error("Prediction failed: " + prediction.error);
    }

    // Attempt parsing JSON
    let outputStr = Array.isArray(prediction.output) ? prediction.output.join("") : prediction.output;
    outputStr = outputStr.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
        const parsed = JSON.parse(outputStr);
        if (!parsed.products) parsed.products = [];
        return parsed;
    } catch (e) {
        console.error("Failed to parse output JSON:", outputStr);
        return { products: [] };
    }
}
