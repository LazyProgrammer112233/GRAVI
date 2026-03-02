import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// UUID v4 Generator (Deno-compatible)
// ============================================================
function generateUUID(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant bits
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ============================================================
// DYNAMIC FMCG BRAND RECOGNITION (REPLACED HARD LIST)
// ============================================================
// Removed rigid FMCG_DATABASE.
// The Vision LLM is now instructed to dynamically read labels from the images
// and construct its own categorized list of brands (known or unknown).

// ============================================================
// ALLOWED INDIAN GROCERY STORE TAXONOMY (CLOSED SET)
// ============================================================
const ALLOWED_STORE_TYPES = new Set([
    "Kirana Store",
    "Mini Supermarket",
    "Supermarket",
    "Hypermarket",
    "Departmental Store",
    "Convenience Store",
    "Wholesale Grocery",
    "Cash & Carry",
    "Organic Store",
    "Dairy Booth",
    "FMCG Distributor Outlet",
    "Medical + Grocery Combo",
    "Provisional Store",
    "General Store",
    "Specialty Food Store",
    "Paan + Convenience Hybrid",
    "Bakery + Grocery Hybrid",
    "Rural Retail Outlet",
]);

// ============================================================
// HELPER: Haversine distance (metres) between two lat/lng pairs
// ============================================================
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371_000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// HELPER: Token similarity score (0–1) between two strings
// ============================================================
function tokenSimilarity(a: string, b: string): number {
    const tokA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
    const tokB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
    let common = 0;
    for (const t of tokA) { if (tokB.has(t)) common++; }
    const total = new Set([...tokA, ...tokB]).size;
    return total === 0 ? 1 : common / total;
}

// ============================================================
// PHASE 1 HELPER: Build safe FAILED response
// ============================================================
function failedResponse(reason: string, sessionId: string) {
    return new Response(JSON.stringify({
        analysis_session_id: sessionId,
        verification_status: "FAILED",
        reason,
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
    });
}

// ============================================================
// STAGE 1: VISION AI — strict classification
// ============================================================
async function runVisionAnalysis(
    base64Images: string[],
    llmApiKey: string,
    placeName: string,
    googleTypes: string[],
): Promise<any> {
    const API_URL = "https://api.groq.com/openai/v1/chat/completions";

    const systemPrompt = `You are GRAVI Core Validation Engine v2.1 — an elite FMCG Retail Intelligence AI.
You are analyzing ${base64Images.length} image(s) of the retail store: "${placeName}" (Google types: ${googleTypes.join(", ") || "unknown"}).

HARD RULES — NEVER VIOLATE:
1. Do NOT hallucinate. Only report what is clearly, unambiguously visible in the image(s).
2. Do NOT guess if you cannot clearly see a label, logo, or sign.
3. If uncertainty exceeds 20%, set store_type to "UNCLASSIFIED" and confidence_score to a value below 75.

DYNAMIC BRAND DETECTION FROM SHELVES:
Aggressively inspect every shelf, refrigerator, and rack pictured. Read the packaging labels, logos, and product names.
You must fetch AND categorize ANY identifiable FMCG brand you see (e.g., local snacks, regional detergents, unknown drinks) — do NOT limit yourself to major international brands.
Group them dynamically under logical categories like "Snacks", "Beverages", "Dairy", "Personal Care", "Staples", "Home Care", etc. 
Do not return empty arrays for categories you invent. If you don't see any brands, leave the object empty {}.

STORE TYPE:
You MUST use exactly one label from this closed taxonomy (or "UNCLASSIFIED"):
Kirana Store, Mini Supermarket, Supermarket, Hypermarket, Departmental Store, Convenience Store, Wholesale Grocery, Cash & Carry, Organic Store, Dairy Booth, FMCG Distributor Outlet, Medical + Grocery Combo, Provisional Store, General Store, Specialty Food Store, Paan + Convenience Hybrid, Bakery + Grocery Hybrid, Rural Retail Outlet

STORE TYPE DECISION WEIGHTS:
- Image structural cues (50%): counter layout → Kirana; 3+ aisles → Supermarket; bulk pallets → Wholesale; etc.
- Brand diversity count (30%): 10+ distinct brands → Supermarket or larger; 2-5 → Kirana/Mini
- Google type metadata (20%): use as a secondary hint only

Return ONLY valid JSON, no markdown:
{
  "store_name_from_image": "",
  "store_type": "",
  "confidence_score": 0,
  "detected_brands": {
    "CategoryName": ["Brand1", "Brand2"]
  },
  "shelf_density_score": 0,
  "review_common_themes": [],
  "reasoning": ""
}`;

    const imageContents = base64Images.map(b64 => ({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${b64}` },
    }));

    const payload = {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: [{ type: "text", text: systemPrompt }, ...imageContents] }],
        max_tokens: 1200,
        stream: false,
        temperature: 0.05,
    };

    const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${llmApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`Vision LLM Error: ${response.status} - ${await response.text()}`);

    const data = await response.json();
    const raw = data.choices[0].message.content;
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
}

// ============================================================
// STAGE 2: REVIEW SUMMARY AI — themes + sentiment
// ============================================================
async function runReviewSummary(
    reviews: Array<{ text: string; rating: number }>,
    llmApiKey: string,
): Promise<{ sentiment: string; common_themes: string[] }> {
    if (!reviews || reviews.length === 0) {
        return { sentiment: "unknown", common_themes: [] };
    }

    const API_URL = "https://api.groq.com/openai/v1/chat/completions";
    const reviewText = reviews
        .map((r, i) => `Review ${i + 1} (Rating: ${r.rating}/5): ${r.text}`)
        .join("\n\n");

    const prompt = `You are a retail analytics AI. Analyze the following ${reviews.length} customer reviews.
STRICT RULES:
1. Summarize ONLY from the provided reviews. Do NOT fabricate.
2. "sentiment": must be exactly one of: "positive", "mixed", or "negative".
3. "common_themes": array of up to 6 short keyword phrases (e.g. "fresh produce", "helpful staff", "long queues").

Reviews:
${reviewText}

Return ONLY:
{ "sentiment": "", "common_themes": [] }`;

    const payload = {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        stream: false,
        temperature: 0.1,
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${llmApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) return { sentiment: "unknown", common_themes: [] };
        const data = await response.json();
        const raw = data.choices[0].message.content;
        const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    } catch {
        return { sentiment: "unknown", common_themes: [] };
    }
}

// ============================================================
// STAGE 3: DETERMINISTIC AUTHENTICITY SCORING
// ============================================================
function computeAuthenticityScore(
    googleTypes: string[],
    detectedBrandsFlat: string[],
    storeType: string,
    confidenceScore: number,
    imagesCount: number,
): { score: number; risk_flags: string[] } {
    const risk_flags: string[] = [];

    const retailTypes = [
        'grocery_or_supermarket', 'convenience_store', 'store', 'supermarket',
        'department_store', 'food_store', 'indian_grocery_store', 'shopping_mall',
    ];
    const isRetailGoogle = googleTypes.some(t => retailTypes.includes(t));
    const brandCount = detectedBrandsFlat.length;

    // Category match (0–30)
    let catScore = 0;
    if (isRetailGoogle && brandCount >= 4) catScore = 30;
    else if (isRetailGoogle) catScore = 18;
    else if (brandCount >= 4) catScore = 12;
    else catScore = 0;

    // Brand presence (0–30)
    let brandScore = 0;
    if (brandCount >= 8) brandScore = 30;
    else if (brandCount >= 4) brandScore = 20;
    else if (brandCount >= 2) brandScore = 10;
    else brandScore = 5;

    // Store type classification quality (0–25)
    let typeScore = 0;
    if (storeType !== "UNCLASSIFIED" && ALLOWED_STORE_TYPES.has(storeType)) {
        typeScore = confidenceScore >= 75 ? 25 : 12;
    } else {
        risk_flags.push("Store type unclassifiable");
    }

    // Image coverage (0–15)
    const imgScore = imagesCount >= 3 ? 15 : imagesCount >= 1 ? 8 : 0;
    if (imagesCount === 0) risk_flags.push("No photos available");

    // Risk flags
    if (brandCount < 2) risk_flags.push("Low brand visibility");
    if (confidenceScore < 75) risk_flags.push("Low AI confidence");

    const score = Math.min(100, catScore + brandScore + typeScore + imgScore);
    return { score, risk_flags };
}

// ============================================================
// MAIN HANDLER
// ============================================================
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    // SESSION ISOLATION — generate UUID at top of every request
    const analysisSessionId = generateUUID();

    try {
        const { mapsUrl } = await req.json();
        if (!mapsUrl) {
            return failedResponse("mapsUrl is required", analysisSessionId);
        }

        const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        if (!googleApiKey) throw new Error("GOOGLE_PLACES_API_KEY not set.");
        const llmApiKey = Deno.env.get('GROQ_API_KEY') ?? '';
        if (!llmApiKey) throw new Error("GROQ_API_KEY not set.");

        // ── PHASE 1 STEP 1: URL Resolution & Coordinate Extraction ──────────────────────────
        let searchQuery = mapsUrl;
        let resolvedUrl = mapsUrl;
        let coordsStr = ""; // e.g., "15.3949851,73.8163628"

        if (mapsUrl.startsWith('http')) {
            try {
                const resolveRes = await fetch(mapsUrl, { method: 'HEAD', redirect: 'follow' });
                resolvedUrl = resolveRes.url;

                // Extract Name Search Query
                const placeMatch = resolvedUrl.match(/\/place\/([^/@?]+)/);
                if (placeMatch?.[1]) {
                    searchQuery = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
                }

                // Strictly Extract GPS Coordinates from /@lat,lng,z bounds in either Shortlink or Longlink
                const coordsMatch = resolvedUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                if (coordsMatch) {
                    coordsStr = `${coordsMatch[1]},${coordsMatch[2]}`;
                    console.log(`[${analysisSessionId}] Active GPS Coordinate Constraint Found: ${coordsStr}`);
                }
            } catch { /* fall back to raw URL */ }
        }
        console.log(`[${analysisSessionId}] Resolved search query: ${searchQuery}`);

        // ── PHASE 1 STEP 2: Find Place — Strict Bound ───────────────────────
        // Append location bias if coords were captured to aggressively bind the text search to that exact location
        const locationBias = coordsStr ? `&locationbias=circle:50@${coordsStr}` : "";
        const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=place_id,name${locationBias}&key=${googleApiKey}`;
        const fpRes = await fetch(findPlaceUrl);
        const fpData = await fpRes.json();

        if (fpData.status !== 'OK' || !fpData.candidates?.length) {
            return failedResponse(`Google Places findplace failed: ${fpData.status}`, analysisSessionId);
        }
        if (fpData.candidates.length > 1) {
            return failedResponse("Multiple place_ids returned — cannot uniquely identify store", analysisSessionId);
        }

        const placeId = fpData.candidates[0].place_id;
        const placeName = fpData.candidates[0].name;
        console.log(`[${analysisSessionId}] Unique Place ID: ${placeId} | Name: ${placeName}`);

        // ── PHASE 1 STEP 3: Full Place Details ──────────────────────
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,types,rating,user_ratings_total,reviews,photos,business_status&key=${googleApiKey}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();

        if (detailsData.status !== 'OK') {
            return failedResponse(`Place details failed: ${detailsData.status}`, analysisSessionId);
        }

        const place = detailsData.result;

        // ── PHASE 1 STEP 5: Build Immutable Identity Lock ───────────
        const identityLock = {
            place_id: placeId,
            name: place.name || placeName,
            lat: place.geometry?.location?.lat ?? null,
            lng: place.geometry?.location?.lng ?? null,
            address: place.formatted_address || "Unknown",
            review_count: place.user_ratings_total || 0,
        };
        Object.freeze(identityLock);
        console.log(`[${analysisSessionId}] Identity Lock: ${JSON.stringify(identityLock)}`);

        // ── PHASE 1 STEP 4: Photo Fetch (max 4, same place_id) ──────
        const googleTypes: string[] = place.types || [];
        const avgRating: number = place.rating || 0;

        const rawReviews = place.reviews || [];
        const recentReviews = rawReviews
            .sort((a: any, b: any) => b.time - a.time)
            .slice(0, 10)
            .map((r: any) => ({
                author: r.author_name || "Anonymous",
                rating: r.rating || 0,
                text: r.text || "",
                date: new Date(r.time * 1000).toISOString().split('T')[0],
            }));

        const photos = place.photos || [];
        const photoRefs: string[] = photos.slice(0, 4).map((p: any) => p.photo_reference);
        console.log(`[${analysisSessionId}] Fetching ${photoRefs.length} photos...`);

        const base64Images: string[] = [];
        for (const ref of photoRefs) {
            const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${googleApiKey}`;
            try {
                const imageRes = await fetch(photoUrl);
                if (imageRes.ok) {
                    const buf = await imageRes.arrayBuffer();
                    const uint8 = new Uint8Array(buf);
                    let binary = '';
                    for (let j = 0; j < uint8.byteLength; j += 1024) {
                        binary += String.fromCharCode.apply(null, uint8.subarray(j, j + 1024) as any);
                    }
                    base64Images.push(btoa(binary));
                }
            } catch { /* skip failed images */ }
        }

        if (base64Images.length === 0) {
            return failedResponse("No images could be downloaded for this listing.", analysisSessionId);
        }

        // ── PHASE 2 + PHASE 3 STEP 6: Parallel LLM Calls ───────────
        console.log(`[${analysisSessionId}] Running Vision AI + Review Summary in parallel...`);
        const [visionResult, reviewIntelligence] = await Promise.all([
            runVisionAnalysis(base64Images, llmApiKey, identityLock.name, googleTypes),
            runReviewSummary(recentReviews, llmApiKey),
        ]);

        // ── PHASE 2: Enforce closed store type taxonomy ──────────────
        const rawStoreType: string = visionResult.store_type || "UNCLASSIFIED";
        const storeType = ALLOWED_STORE_TYPES.has(rawStoreType) ? rawStoreType : "UNCLASSIFIED";
        const confidenceScore: number = typeof visionResult.confidence_score === 'number'
            ? (visionResult.confidence_score <= 1
                ? Math.round(visionResult.confidence_score * 100)
                : Math.round(visionResult.confidence_score))
            : 0;
        const storeTypeConfidence = confidenceScore >= 75 ? "HIGH" : "LOW";

        // ── PHASE 3: Forward Dynamics Brands ─────────────────────────
        // We now accept the Vision AI's dynamically categorized brands directly.
        const detectedBrands: Record<string, string[]> = visionResult.detected_brands || {};

        // Clean out empty categories
        for (const key of Object.keys(detectedBrands)) {
            if (!Array.isArray(detectedBrands[key]) || detectedBrands[key].length === 0) {
                delete detectedBrands[key];
            }
        }
        const detectedBrandsFlat = Object.values(detectedBrands).flat();

        // ── PHASE 3: Deterministic Authenticity Score ────────────────
        const { score: authenticityScore, risk_flags } = computeAuthenticityScore(
            googleTypes, detectedBrandsFlat, storeType, confidenceScore, base64Images.length,
        );

        // ── PHASE 3: Pre-output Cross-Check (identity lock) ──────────
        // Confirm place_id is unchanged from the identity lock — prevents contamination
        if (!identityLock.place_id || identityLock.place_id !== placeId) {
            return failedResponse("Identity lock mismatch detected — analysis aborted.", analysisSessionId);
        }

        // ── BUILD FINAL v2.0 RESPONSE CONTRACT ───────────────────────
        const finalResponse = {
            analysis_session_id: analysisSessionId,
            verification_status: "VERIFIED",
            place_identity_lock: identityLock,
            store_type: storeType,
            store_type_confidence: storeTypeConfidence,
            store_name_from_image: visionResult.store_name_from_image || "Unknown",
            detected_brands: detectedBrands,
            review_intelligence: {
                sentiment: reviewIntelligence.sentiment || "unknown",
                common_themes: Array.isArray(reviewIntelligence.common_themes)
                    ? reviewIntelligence.common_themes
                    : [],
            },
            ratings_data: {
                average_rating: avgRating,
                total_reviews: identityLock.review_count,
            },
            recent_reviews: recentReviews,
            images_analyzed: base64Images.length,
            shelf_density_score: Number(visionResult.shelf_density_score) || 0,
            authenticity_score: authenticityScore,
            risk_flags,
        };

        console.log(`[${analysisSessionId}] Analysis complete. Score: ${authenticityScore} | Type: ${storeType} | Status: VERIFIED`);

        return new Response(JSON.stringify({ success: true, v2: true, results: finalResponse }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (err: any) {
        console.error(`[${analysisSessionId}] Function Error:`, err);
        return new Response(JSON.stringify({
            analysis_session_id: analysisSessionId,
            verification_status: "FAILED",
            reason: err?.message || "Unknown server error",
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
