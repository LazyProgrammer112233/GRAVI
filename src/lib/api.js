import { supabase } from './supabase';

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// A public generic store image proxy to bypass browser CORS when we don't have real drive bytes
const MOCK_STORE_IMG_URL = "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80";

async function fetchQwenAnalysis(imageUrl, fileName) {
    const token = import.meta.env.VITE_GROQ_API_KEY;
    if (!token) {
        throw new Error("Missing VITE_GROQ_API_KEY in .env variables.");
    }

    const systemPrompt = `You are an elite retail intelligence Vision AI. Analyze the primary image and any interior images of the retail store provided. Return ONLY a valid JSON object matching the exact schema below without markdown formatting.

CRITICAL INSTRUCTIONS TO PREVENT HALLUCINATIONS & ENSURE EXTREME ACCURACY:
1. "store_name": Extract the precise actual name of the shop/store from the main exterior signboard. If not visible, return "Unknown". Do NOT confuse product brands with the store name.
2. "visible_brands": You MUST deeply and precisely scan the INTERIOR images, shelves, and signs. Detect specific packaged products visible on the shelves or in refrigerators, then aggressively identify their parent FMCG brand (e.g., if you see a red soda can, identify "Coca-Cola"; if you see yellow chips, identify "Lay's"; if you see blue soap wrappers, identify "Rin"). You MUST try to find an absolute minimum of 4 to 5 distinct FMCG brands visible inside the store.
3. DO NOT include the store name in "visible_brands". This array is strictly for FMCG brands sold inside. You must act like an expert analyzing product packaging shapes, shapes, and colors.
4. "dominant_brand": Identify the most heavily stocked or prominent FMCG brand across all visible products.
5. "store_type_confidence": MUST be an integer between 0 and 100 representing your percentage of confidence (e.g. 95). Do not use decimals.
6. Base everything specifically on visual evidence in the image(s). Look extremely closely at logos, packaging colors, and shapes to infer brands if text is slightly blurry.

{
  "store_name": "string",
  "is_valid_grocery_store": true/false,
  "store_type": "supermarket_shelf" or "kirana_exterior" or "other",
  "store_type_confidence": 90,
  "estimated_store_size": "Large" or "Medium" or "Small",
  "visible_brands": ["BrandA", "BrandB"],
  "dominant_brand": "BrandA" or "None",
  "ad_materials_detected": ["poster", "dangler"] or [],
  "category_detected": "Snacks",
  "shelf_density_estimate": "High Density" or "Sparse" or "Mixed",
  "out_of_stock_signals": "Yes" or "No" or "Unknown",
  "competitive_brand_presence": "High fragmentation" or "Low",
  "reasoning": "Brief explanation of analysis"
}`;

    const payload = {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: systemPrompt },
                    { type: "image_url", image_url: { url: imageUrl } }
                ]
            }
        ],
        max_tokens: 500,
        stream: false
    };

    const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Groq API HTTP Error: ${response.status} - ${await response.text()}`);
    }

    const data = await response.json();
    let contentStr = data.choices[0].message.content;

    try {
        contentStr = contentStr.replace(/```json/gi, '').replace(/```/g, '').trim();
        // Extract just the JSON block if the model babbled
        const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            contentStr = jsonMatch[0];
        }

        const result = JSON.parse(contentStr);

        return {
            image_name: fileName,
            ...result,
            // Fallbacks if LLM misses a field
            is_valid_grocery_store: result.is_valid_grocery_store ?? true,
            store_type: result.store_type ?? 'unknown',
            store_type_confidence: result.store_type_confidence ?? 80,
            estimated_store_size: result.estimated_store_size ?? 'Unknown',
            visible_brands: Array.isArray(result.visible_brands) ? result.visible_brands : (result.visible_brands ? [result.visible_brands] : []),
            dominant_brand: result.dominant_brand ?? 'Unknown',
            ad_materials_detected: Array.isArray(result.ad_materials_detected) ? result.ad_materials_detected : (result.ad_materials_detected ? [result.ad_materials_detected] : []),
            category_detected: result.category_detected ?? 'Unknown',
            shelf_density_estimate: result.shelf_density_estimate ?? 'Unknown',
            out_of_stock_signals: result.out_of_stock_signals ?? 'None',
            competitive_brand_presence: result.competitive_brand_presence ?? 'Unknown',
            reasoning: result.reasoning ?? 'Completed by Vision AI'
        };
    } catch (parseError) {
        throw new Error("Failed to parse JSON from LLM: " + contentStr);
    }
}

export async function analyzeImage(gmapsUrl) {
    console.log(`Calling Supabase Edge Function to analyze: ${gmapsUrl}`);

    const { data, error } = await supabase.functions.invoke('analyze-maps-url', {
        body: { mapsUrl: gmapsUrl }
    });

    console.log('Edge Function raw response — data:', data, '| error:', error);

    if (error) {
        throw new Error(`Edge Function Error: ${error.message || JSON.stringify(error)}`);
    }

    // v2.0 response: top-level { success, v2, results }
    if (data && data.v2 === true && data.results) {
        // Surface FAILED verification as an error (don't return broken data to UI)
        if (data.results.verification_status === 'FAILED') {
            throw new Error(`Verification failed: ${data.results.reason || 'Store could not be uniquely identified.'}`);
        }
        // Return v2 results directly — UploadPage will use analysis_session_id as the route key
        return { v2: true, results: data.results };
    }

    // Legacy v1 response: { success, results }
    if (data && data.success && data.results) {
        return { v2: false, results: data.results };
    }

    throw new Error(data?.reason || data?.error || `Unexpected response format: ${JSON.stringify(data)}`);
}

export async function analyzeDriveFolder(folderUrl) {
    try {
        console.log(`Calling Supabase Edge Function to analyze Drive folder.`);
        const { data, error } = await supabase.functions.invoke('analyze-drive-folder', {
            body: { driveUrl: folderUrl }
        });

        if (error) {
            console.error("Supabase Edge Function returned an error:", error);
            throw error;
        }

        if (data && data.success) {
            return {
                is_valid_source: true,
                total_images_processed: data.total_processed,
                results: data.results
            };
        } else {
            throw new Error(data?.error || "Unknown error from server.");
        }

    } catch (e) {
        console.error("Bulk processing failed:", e);
        throw e;
    }
}
