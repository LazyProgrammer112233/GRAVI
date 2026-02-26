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
        model: "Qwen/Qwen3.5-397B-A17B:novita",
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

        // --- 1. GOOGLE MAPS SCRAPING LOGIC ---
        // Implementation out of scope for mockup, but this connects to a headless chromium or Maps API
        const mockBase64 = "base64_string_here_from_maps";

        const llmApiKey = Deno.env.get('HF_TOKEN') ?? 'mock_key';
        const analysis = await analyzeMapsImageWithLLM(mockBase64, llmApiKey);

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
