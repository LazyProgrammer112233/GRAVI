import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─────────────────────────────────────────────────────────────────────────────
// llama-scout — Brand Verification via Groq LLaMA Vision
//
// Takes a list of DB candidates + raw OCR/vision metadata, then asks the
// Groq LLaMA model to pick ONLY the candidates it can confidently match.
// Returns an ARRAY of matched detections (not a single item).
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { candidates, vision_metadata } = await req.json()

        if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
            throw new Error("Must provide an array of Candidate SKUs to evaluate.");
        }

        const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
        if (!GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY is not configured in Supabase Edge Function secrets.");
        }

        const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
        const MODEL_NAME = "meta-llama/llama-4-scout-17b-16e-instruct";

        // Build a numbered list of the candidates for the prompt
        const candidateLines = candidates.map((c: any, idx: number) =>
            `${idx + 1}. Brand: "${c.brand}" | SKU: "${c.sku}" | Category: "${c.category ?? 'Unknown'}" | Packaging: "${c.typical_packaging ?? 'Unknown'}"`
        ).join('\n');

        const ocrText = vision_metadata?.ocr_text?.trim() || '';
        const packagingType = vision_metadata?.packaging_type || '';
        const dominantColors = Array.isArray(vision_metadata?.dominant_colors)
            ? vision_metadata.dominant_colors.join(', ')
            : '';

        const systemPrompt = `You are a strict FMCG brand classifier. Your job is to identify which products from a provided candidate list are genuinely present in the store image data.

STRICT RULES:
1. ONLY select from the provided candidate list — never invent new brands or SKUs.
2. Return an empty array [] if NO candidates match the evidence.
3. A match requires the brand name OR SKU keywords to appear in the OCR text.
4. Do not match if only generic words (soap, cream, bottle) are in the OCR — these are insufficient without a brand name match.
5. Return sorted by confidence descending (highest first).
6. Maximum 5 results.

Candidate List:
${candidateLines}

Evidence from Store Images:
- OCR Text (brands/products read from photos): "${ocrText}"
- Packaging Type: "${packagingType}"
- Dominant Colors: "${dominantColors}"

Return ONLY valid JSON — an array of matched objects:
[
  {
    "brand": "...",
    "sku": "...",
    "confidence": 85,
    "reasoning": "..."
  }
]

If nothing matches, return: []`;

        const payload = {
            model: MODEL_NAME,
            messages: [
                {
                    role: "system",
                    content: "You are a specialized retail FMCG AI. Return only valid JSON. No markdown, no explanation outside JSON."
                },
                {
                    role: "user",
                    content: systemPrompt
                }
            ],
            temperature: 0.05,
            max_tokens: 600,
            stream: false,
        };

        console.log(`[llama-scout] Calling Groq API with ${candidates.length} candidates. OCR length: ${ocrText.length} chars.`);

        const response = await fetch(GROQ_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Groq API error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content ?? '';
        console.log(`[llama-scout] Raw Groq response: ${rawContent.slice(0, 300)}`);

        // Clean and parse the JSON response
        const cleaned = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();

        // Try to extract a JSON array
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        let parsedResult: any[] = [];

        if (arrayMatch) {
            parsedResult = JSON.parse(arrayMatch[0]);
        } else {
            // If model returned a single object for a single match, wrap it
            const objectMatch = cleaned.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                const singleObj = JSON.parse(objectMatch[0]);
                // Only include if it has a non-empty brand AND confidence > 0
                if (singleObj.brand && singleObj.brand !== 'unknown' && singleObj.confidence > 0) {
                    parsedResult = [singleObj];
                }
            }
        }

        // Filter out any "unknown" entries
        parsedResult = parsedResult.filter(
            (r: any) => r.brand && r.brand.toLowerCase() !== 'unknown' && r.confidence > 0
        );

        console.log(`[llama-scout] Final matches: ${parsedResult.length}`);

        return new Response(
            JSON.stringify(parsedResult),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    } catch (error: any) {
        console.error("[llama-scout] Error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
