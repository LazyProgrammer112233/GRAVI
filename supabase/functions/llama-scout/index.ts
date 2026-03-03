import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { candidates, vision_metadata } = await req.json()

        if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
            throw new Error("Must provide an array of Candidate SKUs to evaluate.");
        }

        // This URL points to the self-hosted vLLM or llama.cpp endpoint as specified in requirements
        const LLM_ENDPOINT = Deno.env.get('LLM_INFERENCE_URL') || "http://localhost:11434/v1/chat/completions";
        const MODEL_NAME = Deno.env.get('LLM_MODEL_NAME') || "llama-4-scout";

        let candidateText = "";
        candidates.forEach((c, idx) => {
            candidateText += `${idx + 1}. ${c.brand} - ${c.sku}\n`;
        });

        const systemPrompt = `You are a strict FMCG classifier.

You MUST choose ONLY from this candidate list.

Candidates:
${candidateText}

Image Data:
OCR Text: "${vision_metadata?.ocr_text || ''}"
Packaging: "${vision_metadata?.packaging_type || ''}"
Colors: "${vision_metadata?.dominant_colors ? vision_metadata.dominant_colors.join(', ') : ''}"
Barcode: "${vision_metadata?.barcode || ''}"

Return JSON:
{
  "brand": "",
  "sku": "",
  "confidence": 0,
  "reasoning": ""
}

LLM must not invent products.

If none match:
Return unknown.`;

        const payload = {
            model: MODEL_NAME,
            messages: [
                { "role": "system", "content": "You are a specialized retail AI. Return strictly JSON." },
                { "role": "user", "content": systemPrompt }
            ],
            temperature: 0.1,
            response_format: { "type": "json_object" }
        }

        const response = await fetch(LLM_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Hosted LLM API error: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        let parsedResult;
        try {
            parsedResult = JSON.parse(content);
        } catch (e) {
            throw new Error("Failed to parse LLM response as JSON: " + content);
        }

        return new Response(
            JSON.stringify(parsedResult),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
