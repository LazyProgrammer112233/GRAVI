import { supabase } from './supabase';

const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";

// A public generic store image proxy to bypass browser CORS when we don't have real drive bytes
const MOCK_STORE_IMG_URL = "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80";

async function fetchQwenAnalysis(imageUrl, fileName) {
    const token = import.meta.env.VITE_HF_TOKEN;
    if (!token) {
        throw new Error("Missing VITE_HF_TOKEN in .env variables.");
    }

    const systemPrompt = `You are an expert retail analysis AI. Look at this image of a retail store and return ONLY a valid JSON object matching this exact schema. Do not include markdown blocks like \`\`\`json.
{
  "is_valid_grocery_store": true/false,
  "store_type": "supermarket_shelf" or "kirana_exterior" or "other",
  "store_type_confidence": 90,
  "estimated_store_size": "Large" or "Medium" or "Small",
  "visible_brands": ["BrandA", "BrandB"],
  "dominant_brand": "BrandA",
  "ad_materials_detected": ["poster", "dangler"] or [],
  "category_detected": "Snacks",
  "shelf_density_estimate": "High Density" or "Sparse" or "Mixed",
  "out_of_stock_signals": "Minor gaps" or "None",
  "competitive_brand_presence": "High fragmentation" or "Low",
  "reasoning": "Brief explanation of analysis"
}`;

    const payload = {
        model: "Qwen/Qwen3.5-397B-A17B:novita",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: systemPrompt },
                    { type: "image_url", image_url: { url: imageUrl } }
                ]
            }
        ]
    };

    const response = await fetch(HF_API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`HF API HTTP Error: ${response.status} - ${await response.text()}`);
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
    try {
        console.log(`Calling Supabase Edge Function to analyze: ${gmapsUrl}`);
        const { data, error } = await supabase.functions.invoke('analyze-maps-url', {
            body: { mapsUrl: gmapsUrl, storeId: 'frontend_direct_run_no_store_id' }
        });

        if (error) {
            console.error("Supabase Edge Function returned an error:", error);
            throw error;
        }

        if (data && data.success && data.results) {
            return data.results;
        } else {
            throw new Error(data?.error || "Unknown error from server.");
        }
    } catch (e) {
        console.error("Single image analysis failed:", e);
        return {
            is_valid_grocery_store: false,
            reasoning: `AI Processing Failed: ${e.message} (Please verify backend configuration.)`
        };
    }
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
