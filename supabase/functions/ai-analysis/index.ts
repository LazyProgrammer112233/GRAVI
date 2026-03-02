import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// INTERNAL FMCG BRAND REFERENCE LIST
// Used only for gap analysis comparing detected vs known brands
// ============================================================
const FMCG_REFERENCE_BRANDS = [
    // Beverages
    "Coca-Cola", "Pepsi", "Sprite", "Thums Up", "Limca", "Fanta", "7UP", "Mountain Dew",
    "Red Bull", "Monster", "Bisleri", "Kinley", "Aquafina", "Bailley", "Tropicana",
    "Real Juice", "Minute Maid", "Maaza", "Frooti", "Appy Fizz", "Nescafe", "Bru",
    // Snacks
    "Lay's", "Kurkure", "Pringles", "Haldiram's", "Bikano", "Balaji Wafers", "Bingo",
    "Uncle Chips", "Doritos", "Act II", "Parle", "Britannia",
    // Dairy
    "Amul", "Mother Dairy", "Nestle", "Milkmaid", "Yakult",
    // Personal Care
    "HUL", "Dove", "Lux", "Lifebuoy", "Pears", "Dettol", "Savlon",
    "Colgate", "Pepsodent", "Oral-B", "Pantene", "Head & Shoulders", "Sunsilk",
    "Clinic Plus", "Parachute", "Dabur", "Patanjali", "Himalaya", "Biotique",
    // Home Care
    "Surf Excel", "Ariel", "Rin", "Tide", "Vim", "Lizol", "Colin", "Harpic",
    "Mortein", "All Out", "Godrej", "Kiwi",
    // Staples / FMCG
    "ITC", "Maggi", "Yippee", "Top Ramen", "Knorr", "Sunfeast", "Bourbon",
    "Marie Gold", "Hide & Seek", "Oreo", "Cadbury", "KitKat", "5-Star",
    "Eclairs", "Mentos", "Boomer",
];

// ============================================================
// LLM CALL HELPER
// ============================================================
async function callLLM(prompt: string, llmApiKey: string, maxTokens = 600): Promise<any> {
    const API_URL = "https://api.groq.com/openai/v1/chat/completions";
    const payload = {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        stream: false,
        temperature: 0.05,
    };

    const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${llmApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`LLM Error: ${response.status} - ${await response.text()}`);

    const data = await response.json();
    const raw = data.choices[0].message.content;
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
}

// ============================================================
// SECTION 1: REVIEW SUMMARY (LLM — strictly from review texts)
// ============================================================
async function runReviewInsights(
    reviews: Array<{ text: string; rating: number; author: string }>,
    llmApiKey: string,
): Promise<any> {
    if (!reviews || reviews.length < 10) {
        return {
            insufficient_data: true,
            message: "Not enough reviews for meaningful analysis",
            minimum_required: 10,
            provided: reviews?.length ?? 0,
        };
    }

    const reviewText = reviews
        .filter(r => r.text && r.text.trim().length > 0)
        .map((r, i) => `Review ${i + 1} (★${r.rating}/5 by ${r.author}): "${r.text}"`)
        .join("\n\n");

    const prompt = `You are a retail analytics AI. You have been given ${reviews.length} real customer reviews from a retail store.

ABSOLUTE RULES — NEVER VIOLATE:
1. Analyze ONLY the review texts provided below. Do NOT fabricate, invent, or imagine any reviews.
2. "positive_themes": Extract ONLY recurring positive subjects directly mentioned in the reviews.
3. "negative_themes": Extract ONLY recurring negative subjects directly mentioned in the reviews.
4. "overall_sentiment": Must be exactly one of: "Mostly positive", "Mostly negative", "Mixed", "Neutral".
5. Do NOT include themes not supported by at least 2 reviews.
6. If there is insufficient text content → set "insufficient_data": true.
7. Return ONLY valid JSON. No markdown. No text outside JSON.

Customer Reviews:
${reviewText}

Return ONLY:
{
  "review_summary": {
    "positive_themes": ["theme1", "theme2"],
    "negative_themes": ["theme1"],
    "overall_sentiment": "Mostly positive",
    "total_reviews_analyzed": ${reviews.length}
  }
}`;

    try {
        const result = await callLLM(prompt, llmApiKey, 500);
        return result.review_summary || result;
    } catch {
        return { insufficient_data: true, message: "Review analysis failed" };
    }
}

// ============================================================
// SECTION 2: FMCG GAP ANALYSIS (image-based only)
// ============================================================
async function runFMCGGapAnalysis(
    imageAnalysis: Array<{ image_index: number; type: string; findings: string[] }>,
    detectedBrands: Record<string, string[]>,
    llmApiKey: string,
): Promise<any> {
    if (!imageAnalysis || imageAnalysis.length === 0) {
        return { insufficient_data: true, message: "No image analysis data available", gaps_detected: [] };
    }

    const detectedBrandsFlat = Object.values(detectedBrands || {}).flat();
    const notDetected = FMCG_REFERENCE_BRANDS.filter(
        b => !detectedBrandsFlat.some(d => d.toLowerCase() === b.toLowerCase())
    );

    const imageContext = JSON.stringify(imageAnalysis, null, 2);
    const detectedContext = JSON.stringify(detectedBrands, null, 2);

    const prompt = `You are a retail execution analyst. Analyze the following image-based findings from a store inspection.

ABSOLUTE RULES:
1. Base ALL analysis ONLY on the provided image_analysis and detected_brands data below.
2. Do NOT assume, predict, or invent any information not in the provided data.
3. If a brand is not detected → say: "Brand not visible in analysed images" (use this exact phrasing).
4. Do NOT conclude the store does not stock a brand — only that it was not visible in images.
5. Shelf density, promotional materials, and branding gaps must come ONLY from findings.
6. Return ONLY valid JSON. No markdown.

IMAGE ANALYSIS DATA:
${imageContext}

DETECTED BRANDS:
${detectedContext}

Identify execution gaps visible in the image data. Look for:
- Low shelf density mentioned in findings
- Missing promotional materials mentioned in findings  
- Exterior branding gaps mentioned in findings
- Any specific execution issues mentioned

Return ONLY:
{
  "gaps_detected": [
    "description of gap found in image data"
  ],
  "image_coverage": "number of images analyzed",
  "notes": "any important caveats about what was and was not visible"
}`;

    try {
        const result = await callLLM(prompt, llmApiKey, 600);
        // Add brand gap info (deterministic, no LLM)
        const topMissingBrands = notDetected.slice(0, 10).map(b => `${b} not visible in analysed images`);
        return {
            ...result,
            brand_gaps: topMissingBrands,
            total_images_analyzed: imageAnalysis.length,
        };
    } catch {
        return {
            insufficient_data: true,
            message: "FMCG gap analysis failed",
            gaps_detected: [],
            brand_gaps: [],
        };
    }
}

// ============================================================
// SECTION 3: COMPETITION ANALYSIS (Places API 1km radius)
// ============================================================
async function runCompetitionAnalysis(
    lat: number,
    lng: number,
    excludePlaceId: string,
    googleApiKey: string,
): Promise<any> {
    if (!lat || !lng) {
        return { insufficient_data: true, message: "Store coordinates not available", nearby_competitors: [], competition_density: "Unknown" };
    }

    const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=1000&type=grocery_or_supermarket|convenience_store&key=${googleApiKey}`;

    try {
        const res = await fetch(nearbyUrl);
        const data = await res.json();

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            return { insufficient_data: true, message: `Places API error: ${data.status}`, nearby_competitors: [], competition_density: "Unknown" };
        }

        const competitors = (data.results || [])
            .filter((p: any) => p.place_id !== excludePlaceId)
            .slice(0, 10)
            .map((p: any) => {
                const compLat = p.geometry?.location?.lat ?? lat;
                const compLng = p.geometry?.location?.lng ?? lng;
                const dist = Math.round(Math.sqrt(
                    Math.pow((compLat - lat) * 111320, 2) +
                    Math.pow((compLng - lng) * 111320 * Math.cos(lat * Math.PI / 180), 2)
                ));
                return {
                    name: p.name,
                    rating: p.rating ?? null,
                    reviews: p.user_ratings_total ?? 0,
                    distance_meters: dist,
                    place_id: p.place_id,
                };
            })
            .sort((a: any, b: any) => a.distance_meters - b.distance_meters);

        // Competition density logic
        const count = competitors.length;
        let competition_density = "Low";
        if (count >= 6) competition_density = "High";
        else if (count >= 3) competition_density = "Medium";

        return {
            nearby_competitors: competitors,
            competition_density,
            total_competitors_found: count,
            radius_meters: 1000,
        };
    } catch (e) {
        return {
            insufficient_data: true,
            message: `Competition analysis failed: ${(e as Error).message}`,
            nearby_competitors: [],
            competition_density: "Unknown",
        };
    }
}

// ============================================================
// SECTION 4: BRAND VISIBILITY REPORT (deterministic)
// ============================================================
function runBrandVisibilityReport(
    detectedBrands: Record<string, string[]>,
): any {
    const detectedFlat = Object.values(detectedBrands || {}).flat();

    if (detectedFlat.length === 0) {
        return {
            insufficient_data: true,
            message: "No brand data from image analysis",
            visible_brands: [],
            not_visible_brands: FMCG_REFERENCE_BRANDS.map(b => `${b} not visible in analysed images`),
        };
    }

    const notVisible = FMCG_REFERENCE_BRANDS
        .filter(b => !detectedFlat.some(d => d.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(d.toLowerCase())))
        .map(b => b);

    return {
        visible_brands: detectedFlat,
        not_visible_brands: notVisible,
        visible_count: detectedFlat.length,
        not_visible_count: notVisible.length,
        brand_categories: detectedBrands,
        note: "Brand visibility is based solely on image analysis. Absence does not imply the store does not stock the brand.",
    };
}

// ============================================================
// MAIN HANDLER
// ============================================================
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const body = await req.json();
        const { store_details, reviews, image_analysis, detected_brands, nearby_stores } = body;

        if (!store_details) {
            return new Response(JSON.stringify({ error: "store_details is required" }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            });
        }

        const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        if (!googleApiKey) throw new Error("GOOGLE_PLACES_API_KEY not set.");
        const llmApiKey = Deno.env.get('GROQ_API_KEY') ?? '';
        if (!llmApiKey) throw new Error("GROQ_API_KEY not set.");

        const lat = store_details.lat ?? null;
        const lng = store_details.lng ?? null;
        const placeId = store_details.place_id ?? null;

        console.log(`[AI-ANALYSIS] Running 4 sections for store: ${store_details.name}`);

        // Run all 4 sections in parallel (LLM has NO internet — only reads provided JSON)
        const [reviewInsights, fmcgGaps, competition] = await Promise.all([
            runReviewInsights(reviews || [], llmApiKey),
            runFMCGGapAnalysis(image_analysis || [], detected_brands || {}, llmApiKey),
            runCompetitionAnalysis(lat, lng, placeId, googleApiKey),
        ]);

        // Section 4 is deterministic — no async needed
        const brandVisibility = runBrandVisibilityReport(detected_brands || {});

        const finalResponse = {
            success: true,
            store_name: store_details.name,
            sections: {
                review_insights: reviewInsights,
                fmcg_gap_analysis: fmcgGaps,
                competition_analysis: competition,
                brand_visibility: brandVisibility,
            },
            generated_at: new Date().toISOString(),
            data_sources: ["Google Places API", "Vision AI Image Analysis", "Customer Reviews"],
            llm_constraint: "LLM analyzed only provided structured JSON. No internet access. No assumptions made.",
        };

        console.log(`[AI-ANALYSIS] Analysis complete for ${store_details.name}`);

        return new Response(JSON.stringify(finalResponse), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (err: any) {
        console.error(`[AI-ANALYSIS] Error:`, err);
        return new Response(JSON.stringify({
            success: false,
            error: err?.message || "Unknown server error",
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
