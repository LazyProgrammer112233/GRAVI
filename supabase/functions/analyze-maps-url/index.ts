import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function analyzeMapsImageWithLLM(base64Image: string, llmApiKey: string) {
    console.log(`Analyzing maps image extraction via Hugging Face Router`);

    const API_URL = "https://router.huggingface.co/v1/chat/completions";

    const systemPrompt = `You are a retail analysis AI. Analyze this image of a retail store and return ONLY a JSON object exactly matching this schema without markdown formatting:
{
  "is_valid_grocery_store": boolean,
  "store_type": string,
  "store_type_confidence": number,
  "estimated_store_size": string,
  "visible_brands": [string],
  "dominant_brand": string,
  "ad_materials_detected": [string],
  "category_detected": string,
  "shelf_density_estimate": string,
  "out_of_stock_signals": string,
  "competitive_brand_presence": string,
  "reasoning": string
}`;

    const payload = {
        model: "meta-llama/Llama-3.2-11B-Vision-Instruct",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: systemPrompt },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                ]
            }
        ]
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${llmApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`LLM API Error: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        const contentStr = data.choices[0].message.content;

        // Sometimes LLMs wrap JSON in markdown blocks, clean it
        const cleanedStr = contentStr.replace(/```json/gi, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleanedStr);

        return {
            image_name: 'maps_extraction_photo.jpg',
            ...result,
            is_valid_grocery_store: result.is_valid_grocery_store ?? true,
            store_type: result.store_type ?? 'unknown',
            store_type_confidence: result.store_type_confidence ?? 80,
            estimated_store_size: result.estimated_store_size ?? 'Unknown',
            visible_brands: result.visible_brands ?? [],
            dominant_brand: result.dominant_brand ?? 'Unknown',
            ad_materials_detected: result.ad_materials_detected ?? [],
            category_detected: result.category_detected ?? 'Unknown',
            shelf_density_estimate: result.shelf_density_estimate ?? 'Unknown',
            out_of_stock_signals: result.out_of_stock_signals ?? 'None',
            competitive_brand_presence: result.competitive_brand_presence ?? 'Unknown',
            reasoning: result.reasoning ?? 'Completed by Vision AI'
        };
    } catch (e) {
        console.error("LLM Integration failed, returning fallback. Error:", e);
        throw e;
    }
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { mapsUrl, storeId } = await req.json();

        if (!mapsUrl) {
            return new Response(JSON.stringify({ error: 'mapsUrl is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: req.headers.get('Authorization')! } }
        });

        // --- 1. GOOGLE PLACES API LOGIC ---
        const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        if (!googleApiKey) {
            throw new Error("GOOGLE_PLACES_API_KEY is not set in environment.");
        }

        // Extremely basic text search to find Place ID from URL or query
        // We'll treat the mapsUrl as a query if it's text, or try to extract from a real URL
        let searchQuery = mapsUrl;

        let placeId = null;
        let placeName = "Unknown Store";

        console.log(`Searching Google Places for: ${searchQuery}`);

        // Find Place Request
        const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=place_id,name&key=${googleApiKey}`;
        const findPlaceRes = await fetch(findPlaceUrl);
        const findPlaceData = await findPlaceRes.json();

        if (findPlaceData.status === 'OK' && findPlaceData.candidates && findPlaceData.candidates.length > 0) {
            placeId = findPlaceData.candidates[0].place_id;
            placeName = findPlaceData.candidates[0].name;
            console.log(`Found Place ID: ${placeId} (${placeName})`);
        } else {
            throw new Error(`Could not find a Google Place matching the input. Google API Status: ${findPlaceData.status}`);
        }

        // Place Details Request to get photos
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,photos,types&key=${googleApiKey}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();

        if (detailsData.status !== 'OK') {
            throw new Error(`Failed to fetch place details. Google API Status: ${detailsData.status}`);
        }

        const types = detailsData.result.types || [];
        // Basic pre-validation based on Google Types
        const isLikelyRetail = types.some((t: string) => ['grocery_or_supermarket', 'convenience_store', 'store', 'supermarket', 'department_store'].includes(t));
        const isInvalidLocation = types.some((t: string) => ['restaurant', 'cafe', 'bar', 'lodging'].includes(t)) && !isLikelyRetail;

        if (isInvalidLocation) {
            return new Response(JSON.stringify({
                success: true,
                results: {
                    is_valid_grocery_store: false,
                    reasoning: `Google Places classifies this as ${types.join(', ')}, which indicates it is not a grocery or retail store.`,
                    store_type: 'unknown',
                    estimated_store_size: 'Unknown',
                    visible_brands: [],
                    dominant_brand: 'Unknown',
                    ad_materials_detected: [],
                    category_detected: 'Unknown',
                    shelf_density_estimate: 'Unknown',
                    out_of_stock_signals: 'Unknown',
                    competitive_brand_presence: 'Unknown',
                    image_name: 'No Image Processed'
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        const photos = detailsData.result.photos;
        if (!photos || photos.length === 0) {
            throw new Error("No photos found for this Google Place.");
        }

        // Take the first photo reference (usually the main one)
        const photoRef = photos[0].photo_reference;

        // Fetch Photo Base64
        console.log("Fetching photo bytes from Google Places...");
        // Get max width 800 for reasonable LLM payload size
        const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${googleApiKey}`;

        // Fetch the raw image bytes
        const imageRes = await fetch(photoUrl);
        if (!imageRes.ok) {
            throw new Error(`Failed to download image from Google Places API. Status: ${imageRes.status}`);
        }

        const imageBuffer = await imageRes.arrayBuffer();

        // Convert array buffer to base64 safely
        // Deno doesn't support Buffer globally easily in edge functions, so we chunk it or use a proper btoa approach
        const uint8Array = new Uint8Array(imageBuffer);
        let binaryString = '';
        for (let i = 0; i < uint8Array.byteLength; i += 1024) {
            const chunk = uint8Array.subarray(i, i + 1024);
            binaryString += String.fromCharCode.apply(null, chunk as any);
        }
        const base64String = btoa(binaryString);


        const llmApiKey = Deno.env.get('HF_TOKEN') ?? 'mock_key';
        console.log(`Sending real store photo to LLM API...`);
        const analysis = await analyzeMapsImageWithLLM(base64String, llmApiKey);
        analysis.image_name = `${placeName.replace(/\s+/g, '_')}_maps_photo.jpg`;

        // --- 2. INSERT INTO DB ---
        if (storeId) {
            const { error: insertError } = await supabaseClient.from('analysis_results').insert({
                store_id: storeId,
                image_name: analysis.image_name,
                is_valid_grocery_store: analysis.is_valid_grocery_store,
                store_type: analysis.store_type,
                store_type_confidence: analysis.store_type_confidence,
                estimated_store_size: analysis.estimated_store_size,
                visible_brands: analysis.visible_brands,
                dominant_brand: analysis.dominant_brand,
                ad_materials_detected: analysis.ad_materials_detected,
                category_detected: analysis.category_detected,
                shelf_density_estimate: analysis.shelf_density_estimate,
                out_of_stock_signals: analysis.out_of_stock_signals,
                competitive_brand_presence: analysis.competitive_brand_presence,
                reasoning: analysis.reasoning
            });

            if (insertError) console.error("Database Insert Error:", insertError);
        }

        return new Response(JSON.stringify({
            success: true,
            results: analysis
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (err) {
        console.error("Function Error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
