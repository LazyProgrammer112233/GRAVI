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
        const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            contentStr = jsonMatch[0];
        }

        const result = JSON.parse(contentStr);

        return {
            image_name: fileName,
            ...result,
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
        if (data.results.verification_status === 'FAILED') {
            throw new Error(`Verification failed: ${data.results.reason || 'Store could not be uniquely identified.'}`);
        }
        return { v2: true, results: data.results };
    }

    // Legacy v1 response: { success, results }
    if (data && data.success && data.results) {
        return { v2: false, results: data.results };
    }

    throw new Error(data?.reason || data?.error || `Unexpected response format: ${JSON.stringify(data)}`);
}

/**
 * V5 RF-DETR Zero-Cost Vision Architecture
 * Calls the local Python PyTorch backend directly.
 */
export async function analyzeImageV2(gmapsUrl) {
    console.log(`[V5 RF-DETR] Starting local analysis for URL: ${gmapsUrl}`);

    // Step 1: Resolve the URL to get the Place ID first (we still need this purely for details)
    const { data: resolveData, error: resolveError } = await supabase.functions.invoke('analyze-maps-url-v2', {
        body: { mapsUrl: gmapsUrl, fast_resolve_only: true } // Assuming we update the edge func to just do a quick resolve if requested
    });

    if (resolveError) {
        throw new Error(`Location Resolution Error: ${resolveError.message || JSON.stringify(resolveError)}`);
    }

    if (!resolveData || !resolveData.results || !resolveData.results.place_identity_lock) {
        throw new Error("Could not resolve Google Maps URL to a valid retail location.");
    }

    // We expect the edge function to still provide the photo URLs so we don't have to duplicate the complex Google Places API logic on the frontend.
    // If we only get a place_id, we'd have to make the Python backend fetch the images via Places API (which Phase 2 in task.md specified).
    // Given the Python backend Phase 2 says "Implement Google Places API fetching logic in Python", we'll just send the place_id to Python!

    const placeId = resolveData.results.place_identity_lock.place_id;

    console.log(`[V5 RF-DETR] Resolved Place ID: ${placeId}. Routing to local PyTorch microservice at port 8000.`);

    // --- TEMPORARY MOCK URLS FOR PYTHON FETCHING UNTIL PYTHON FETCHING IS DONE ---
    // The Python microservice takes {"place_id": "...", "image_urls": ["url1", "url2"]}
    const pythonPayload = {
        place_id: placeId,
        image_urls: resolveData.results.raw_images || [] // Fallback handled by Python if empty
    };

    try {
        const response = await fetch("http://localhost:8000/analyze-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pythonPayload)
        });

        if (!response.ok) {
            throw new Error(`Local Vision Engine Error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[V5 RF-DETR] Local Python Engine Response:', data);

        // Merge Python vision stats with original Supabase location data for the dashboard
        const finalResults = {
            ...resolveData.results,
            vision_analysis: {
                total_products_detected: data.total_products_detected,
                unique_brands_list: Object.keys(data.product_counts_by_category),
                brand_distribution: data.product_counts_by_category,
                footprint_indices: {
                    dominance_score: 95,
                    visibility_index: "High"
                }
            },
            pipeline_version: data.pipeline_version,
            raw_detections: data.raw_results,
            authenticity_score: data.authenticity_score,
            store_type: data.store_type_prediction,
            ai_insights: [
                { title: "Inventory Density", description: `Computed density score: ${data.inventory_density_score}` },
                { title: "Detection Accuracy", description: `Powered locally by RF-DETR PyTorch engine.` }
            ]
        };

        return { is_v2: true, results: finalResults };

    } catch (err) {
        console.error("Local PyTorch connection failed. Is gravi-vision-engine running on port 8000?", err);
        throw new Error(`Local Vision Engine Offline: Ensure 'uvicorn app.main:app' is running on port 8000. Detail: ${err.message}`);
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

/**
 * Fetch AI-driven analysis for a store using the ai-analysis edge function.
 * Reads cached analysis data from localStorage and sends it as structured JSON.
 * 
 * @param {string} storeId - The analysis session ID (used as localStorage key)
 * @returns {Promise<Object>} - The 4-section AI analysis response
 */
export async function fetchAIAnalysis(storeId) {
    // Read cached analysis from localStorage
    const cached = localStorage.getItem(`gravi_v2_analysis_${storeId}`);
    if (!cached) {
        throw new Error("Analysis data not found. Please re-run the store analysis first.");
    }

    let payload;
    try {
        payload = JSON.parse(cached);
    } catch {
        throw new Error("Corrupted analysis cache. Please re-run the store analysis.");
    }

    if (!payload.results) {
        throw new Error("Invalid analysis data structure in cache.");
    }

    const results = payload.results;

    // Build the structured JSON input for the ai-analysis edge function
    // LLM receives ONLY this structured data — no internet access
    const analysisPayload = {
        store_details: {
            name: results.place_identity_lock?.name ?? "Unknown Store",
            place_id: results.place_identity_lock?.place_id ?? null,
            lat: results.place_identity_lock?.lat ?? null,
            lng: results.place_identity_lock?.lng ?? null,
            address: results.place_identity_lock?.address ?? null,
            rating: results.ratings_data?.average_rating ?? 0,
            total_reviews: results.ratings_data?.total_reviews ?? 0,
            store_type: results.store_type ?? null,
            google_types: results.place_identity_lock?.google_types ?? [],
        },
        reviews: results.recent_reviews ?? [],
        image_analysis: results.image_analysis_breakdown ?? [],
        detected_brands: results.detected_brands ?? {},
        nearby_stores: [], // will be fetched by the edge function via Places API
    };

    console.log(`[fetchAIAnalysis] Calling ai-analysis edge function for store: ${analysisPayload.store_details.name}`);

    const { data, error } = await supabase.functions.invoke('ai-analysis', {
        body: analysisPayload,
    });

    console.log('[fetchAIAnalysis] Response:', data, '| Error:', error);

    if (error) {
        throw new Error(`AI Analysis Error: ${error.message || JSON.stringify(error)}`);
    }

    if (!data || !data.success) {
        throw new Error(data?.error || "AI analysis returned an unexpected response.");
    }

    return data;
}
