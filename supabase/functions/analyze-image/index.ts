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
        const { imageBase64, groqApiKey } = await req.json()

        if (!groqApiKey) {
            throw new Error("Groq API key is required")
        }

        const payload = {
            "model": "llama-3.2-90b-vision-preview",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": `You are a strict retail audit AI. Analyze this image for FMCG products.
Rules:
- Identify clearly visible products (Brand, Name, Category).
- Do NOT guess brand names.
- If brand text is not clearly readable, return "Unknown".
- Do NOT hallucinate products.
- Output ONLY valid JSON in format: {"products": [{"brand":"", "product_name":"", "category":"", "confidence":0-100, "reason":""}]}`
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                            }
                        }
                    ]
                }
            ],
            "temperature": 0.1,
            "response_format": { "type": "json_object" }
        }

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${groqApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Groq API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        let parsedResult;
        try {
            parsedResult = JSON.parse(content);
        } catch (e) {
            throw new Error("Failed to parse Groq response as JSON: " + content);
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
