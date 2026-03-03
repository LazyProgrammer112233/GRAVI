export const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// Updated prompt to match Gemini's expectations
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

Return format exactly as:
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

// Keeping the function name the same so we don't break Dashboard imports, 
// but it now uses Gemini API natively.
export async function fetchInternVL2Analysis(base64Image, geminiKey) {
    if (!geminiKey) {
        throw new Error("Gemini API token is required for Bring-Your-Own-Key configuration.");
    }

    geminiKey = geminiKey.trim();

    // Strip the data URL prefix (e.g., "data:image/jpeg;base64,")
    const base64Data = base64Image.split(',')[1];

    // Attempt to guess mime type from the prefix or default to jpeg
    let mimeType = "image/jpeg";
    const prefixMatch = base64Image.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
    if (prefixMatch) {
        mimeType = prefixMatch[1];
    }

    const payload = {
        contents: [{
            parts: [
                { text: V3_PROMPT },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
        }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${geminiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API HTTP Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("Gemini returned no candidates.");
    }

    let outputStr = data.candidates[0].content.parts[0].text;
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
