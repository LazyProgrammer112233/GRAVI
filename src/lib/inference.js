// Uses the new Supabase Edge Function 'analyze-image' to query Groq Llama-3-vision models
export async function fetchInternVL2Analysis(base64Image, groqApiKey) {
    if (!groqApiKey) {
        throw new Error("Llama vision API key is required.");
    }

    const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: {
            imageBase64: base64Image,
            groqApiKey: groqApiKey
        }
    });

    if (error) {
        throw new Error(`Vision API Error: ${error.message}`);
    }

    if (data.error) {
        throw new Error(`Vision API Response Error: ${data.error}`);
    }

    return data;
}
