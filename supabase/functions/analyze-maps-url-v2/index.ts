import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// GRAVI Vision Pipeline v4.0 — Gemini-Powered Architecture
// ─────────────────────────────────────────────────────────
// Phase 0  – Fetch 10 photos from Google Maps
// Phase 1  – Gemini 2.0 Flash "Quick Filter": picks best 2 interior shelf images (parallel)
// Phase 2  – Gemini 2.0 Flash "Dense Audit": spatial grounding + OCR per product (parallel)
// Phase 3  – Groq Llama 3.3 70B: deduplication + normalization (text-only, no image)
//
// Timeout budget:
//   P0 (10 photos, parallel fetch): ~4s
//   P1 (10 quick classify calls, parallel): ~6s
//   P2 (2 deep audit calls, parallel): ~10s
//   P3 (1 groq text call): ~3s
//   Total: ~23s ✅

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateUUID(): string {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function failedResponse(reason: string, sid: string, extra?: object) {
    return new Response(JSON.stringify({
        success: false, v4_gemini: true, analysis_session_id: sid,
        verification_status: "FAILED", reason, ...extra,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
}

function parseJSON(raw: string): any {
    try {
        const cleaned = raw
            .replace(/^```json/gi, '').replace(/^```/gm, '').replace(/```$/gm, '').trim();
        const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        return JSON.parse(match?.[0] || '{}');
    } catch { return {}; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Gemini 2.0 Flash helper
// ──────────────────────────────────────────────────────────────────────────────
async function callGemini(geminiKey: string, prompt: string, b64: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: "image/jpeg", data: b64 } },
                ]
            }],
            generationConfig: {
                temperature: 0.0,
                maxOutputTokens: 4096,
                // NOTE: responseMimeType intentionally removed — forcing JSON mode
                // severely degrades Gemini's image reasoning capability
            },
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini HTTP ${res.status}: ${err.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
}

// ──────────────────────────────────────────────────────────────────────────────
// PHASE 1 — Quick Filter (Gemini, parallel across all fetched images)
// ──────────────────────────────────────────────────────────────────────────────
const FILTER_PROMPT = `You are a retail image classifier for GRAVI, a store analysis system.

Analyze this image. Return ONLY this JSON with no extra text:
{"is_interior_shelf":true,"shelf_coverage_pct":45,"indoor_confidence":0.88,"rejection_reason":null}

Rules:
- is_interior_shelf = true IF: indoor retail environment with visible product racks/shelves OR refrigerated display cases with packaged consumer goods
- shelf_coverage_pct = estimated % of image area covered by shelves/products/racks
- REJECT (is_interior_shelf=false) ONLY if: outdoor sky/road/building exterior clearly visible, or 100% exterior storefront/parking with zero indoor content
- Accept semi-indoor: doorway shots showing shelves inside, narrow aisle shots, cooler/fridge aisles
- REJECT if shelf_coverage_pct < 15`;

async function quickFilter(b64: string, idx: number, geminiKey: string): Promise<{
    idx: number; b64: string;
    is_interior_shelf: boolean;
    shelf_coverage_pct: number;
    indoor_confidence: number;
    rejection_reason: string | null;
}> {
    try {
        const raw = await callGemini(geminiKey, FILTER_PROMPT, b64);
        const parsed = parseJSON(raw);
        return {
            idx,
            b64,
            is_interior_shelf: parsed.is_interior_shelf === true && (parsed.indoor_confidence || 0) >= 0.65,
            shelf_coverage_pct: parsed.shelf_coverage_pct || 0,
            indoor_confidence: parsed.indoor_confidence || 0,
            rejection_reason: parsed.rejection_reason || null,
        };
    } catch (e: any) {
        return { idx, b64, is_interior_shelf: false, shelf_coverage_pct: 0, indoor_confidence: 0, rejection_reason: e.message };
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// PHASE 2 — Dense Shelf Audit with Spatial Grounding (Gemini, parallel)
// ──────────────────────────────────────────────────────────────────────────────
const AUDIT_PROMPT = `You are a retail shelf brand detection expert for Indian FMCG stores.

Look at this image carefully. Your job is to find EVERY product on EVERY shelf.

If this image is a pure exterior shot (outside of a building, street, parking), return:
{"error": "REJECTED_EXTERIOR"}

Otherwise, for EVERY SINGLE packaged product you can see on a shelf or rack:
- Extract the brand name printed on the packaging
- If you can partially read it, still include it
- If there are 30 products, list all 30
- Also look at cooler/fridge glass doors for bottles and cans

DO NOT extract:
- Text from wall signs, banners, or store signboards
- Refrigerator brand logos (e.g., the word "Haier" on a fridge body)

DO extract (even if partially visible or at an angle):
- Brand names printed on product boxes, bottles, packets, pouches, cans, cartons
- Examples: Parle-G, Britannia, Amul, Maggi, Nestle, Colgate, Dettol, Lay's, Kurkure,
  Haldiram's, MDH, Fortune, Tata Salt, Surf Excel, Ariel, Dove, Lifebuoy, etc.

Return ONLY JSON (no markdown, no explanation):
{
  "is_interior": true,
  "shelf_confidence": 0.91,
  "detections": [
    {"box_2d": [120, 80, 310, 220], "label": "Parle-G", "ocr_confidence": 0.88, "category_guess": "Snacks"},
    {"box_2d": [315, 80, 510, 220], "label": "Amul Butter", "ocr_confidence": 0.75, "category_guess": "Dairy"}
  ]
}

box_2d is [ymin, xmin, ymax, xmax] in 0-1000 scale.
ocr_confidence: 0.3 = partially readable, 0.6 = clearly visible, 0.9 = perfectly clear.
Be GENEROUS with detections. Aim to list every single brand you can see.`;


interface Detection {
    box_2d: number[];
    label: string;
    ocr_confidence: number;
    category_guess: string;
    image_index: number;
}

async function denseAudit(b64: string, idx: number, geminiKey: string): Promise<{
    idx: number;
    is_interior: boolean;
    shelf_confidence: number;
    detections: Detection[];
    error?: string;
}> {
    try {
        const raw = await callGemini(geminiKey, AUDIT_PROMPT, b64);
        const parsed = parseJSON(raw);

        if (parsed.error === "REJECTED_EXTERIOR") {
            return { idx, is_interior: false, shelf_confidence: 0, detections: [], error: "REJECTED_EXTERIOR" };
        }

        const detections: Detection[] = Array.isArray(parsed.detections)
            ? parsed.detections
                .filter((d: any) => d.label && d.label.trim().length > 1 && (d.ocr_confidence || 0) >= 0.30)
                .map((d: any) => ({
                    box_2d: d.box_2d || [],
                    label: String(d.label).trim(),
                    ocr_confidence: d.ocr_confidence || 0.4,
                    category_guess: d.category_guess || "Unknown",
                    image_index: idx,
                }))
            : [];

        return {
            idx,
            is_interior: parsed.is_interior !== false,
            shelf_confidence: parsed.shelf_confidence || 0,
            detections,
        };
    } catch (e: any) {
        return { idx, is_interior: false, shelf_confidence: 0, detections: [], error: e.message };
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// BACKWARD COMPATIBILITY: Sentiment & Authenticity Scoring
// ──────────────────────────────────────────────────────────────────────────────
function analyzeReviewSentiment(reviews: any[]): {
    positive_pct: number; neutral_pct: number; negative_pct: number;
    sentiment_label: string; sample_themes: string[];
} {
    if (!reviews || reviews.length === 0) {
        return { positive_pct: 0, neutral_pct: 0, negative_pct: 0, sentiment_label: "unknown", sample_themes: [] };
    }
    const positive = reviews.filter(r => r.rating >= 4).length;
    const negative = reviews.filter(r => r.rating <= 2).length;
    const neutral = reviews.length - positive - negative;
    const total = reviews.length;

    const positivePct = Math.round((positive / total) * 100);
    const negativePct = Math.round((negative / total) * 100);
    const neutralPct = 100 - positivePct - negativePct;

    const label = positivePct >= 60 ? "Mostly Positive"
        : negativePct >= 40 ? "Mostly Negative" : "Mixed";

    return {
        positive_pct: positivePct,
        neutral_pct: neutralPct,
        negative_pct: negativePct,
        sentiment_label: label,
        sample_themes: [],
    };
}

function computeAuthenticityScore(
    avgRating: number,
    reviewCount: number,
    sentiment: { positive_pct: number },
    imagesCount: number,
    shelfQualityScore: number,
    uniqueBrandCount: number,
): number {
    const sentimentScore = Math.round((sentiment.positive_pct / 100) * 25);
    const ratingScore = Math.round((Math.min(avgRating, 5) / 5) * 20);
    const imageScore = imagesCount >= 4 ? 15 : imagesCount >= 2 ? 10 : 5;
    const brandScore = uniqueBrandCount >= 8 ? 25 : uniqueBrandCount >= 4 ? 18 : uniqueBrandCount >= 2 ? 10 : 5;
    const shelfScore = Math.round((Math.min(shelfQualityScore, 100) / 100) * 15);

    return Math.min(100, sentimentScore + ratingScore + imageScore + brandScore + shelfScore);
}

// ──────────────────────────────────────────────────────────────────────────────
// PHASE 3 — Groq Aggregation (TEXT ONLY — blind to image)
// ──────────────────────────────────────────────────────────────────────────────
async function aggregateBrands(allDetections: Detection[], groqKey: string, storeMeta: any): Promise<{
    total_products_detected: number;
    unique_brands_list: string[];
    brand_distribution: any;
    store_footprint_index: string;
    ai_insights: string[];
    shelf_quality_score: number;
    category_presence: any;
    missing_categories: string[];
}> {
    if (allDetections.length === 0) {
        return {
            total_products_detected: 0, unique_brands_list: [], brand_distribution: {},
            store_footprint_index: "Low", ai_insights: ["No distinct FMCG products detected on shelves."],
            shelf_quality_score: 10, category_presence: {}, missing_categories: []
        };
    }

    const rawInput = allDetections.map(d => ({
        label: d.label,
        category: d.category_guess,
        confidence: d.ocr_confidence,
    }));

    const prompt = `You are the GRAVI Aggregation Layer. You receive raw JSON structured visual detections from a retail environment.
Your job: clean, deduplicate, and produce a final retail AI insights audit.

Store Data:
Name: ${storeMeta.name}
Review Rating: ${storeMeta.rating}

Input Vision Data:
${JSON.stringify(rawInput)}

Processing Rules:
1. Normalization: Convert brand variations strictly. Return unique brands as a strict flat array of strings in unique_brands_list.
2. brand_distribution: Build an object mapping the brand to its details including total product sightings count, category, and source "YOLO+OCR".
3. Provide 3-4 highly professional factual AI insights regarding merchandising, shelf stocking, and brand representation in "ai_insights".

Return ONLY valid JSON:
{
  "total_products_detected": 28,
  "unique_brands_list": ["Parle-G", "Britannia"],
  "brand_distribution": {
    "Parle-G": { "count": 5, "category": "Snacks", "source": "YOLO+OCR", "confidence": 0.95 }
  },
  "store_footprint_index": "High",
  "ai_insights": [
    "Parle-G commands the highest shelf density in the Snacks category, occupying 5 out of 28 total visible product facings.",
    "The overall brand fragmentation is low, suggesting a highly organized distributor-led merchandising strategy."
  ],
  "shelf_quality_score": 85,
  "category_presence": { "Snacks": true, "Beverages": false },
  "missing_categories": ["Beverages", "Dairy"]
}`;

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 1500, temperature: 0.0,
            }),
        });
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || "{}";
        const parsed = parseJSON(raw);
        return {
            total_products_detected: parsed.total_products_detected || allDetections.length,
            unique_brands_list: Array.isArray(parsed.unique_brands_list) ? parsed.unique_brands_list : [],
            brand_distribution: parsed.brand_distribution || {},
            store_footprint_index: parsed.store_footprint_index || "Low",
            ai_insights: parsed.ai_insights || [],
            shelf_quality_score: parsed.shelf_quality_score || 50,
            category_presence: parsed.category_presence || {},
            missing_categories: parsed.missing_categories || []
        };
    } catch {
        // Fallback: manual dedup
        const countMap: Record<string, { count: number; category: string }> = {};
        for (const d of allDetections) {
            const key = d.label.toLowerCase().trim();
            if (!countMap[key]) countMap[key] = { count: 0, category: d.category_guess };
            countMap[key].count++;
        }
        const unique_brands_list = Object.keys(countMap).map(k => k.charAt(0).toUpperCase() + k.slice(1));
        const distribution: any = {};
        for (const k of unique_brands_list) {
            const low = k.toLowerCase();
            distribution[k] = { count: countMap[low]?.count || 1, category: countMap[low]?.category || "Unknown", source: "YOLO+OCR", confidence: 0.9 };
        }
        return {
            total_products_detected: allDetections.length,
            unique_brands_list,
            brand_distribution: distribution,
            store_footprint_index: allDetections.length > 25 ? "High" : allDetections.length > 10 ? "Medium" : "Low",
            ai_insights: ["Fallback parsing: Detailed AI insights could not be securely generated for this image set due to text timeout."],
            shelf_quality_score: 55,
            category_presence: {},
            missing_categories: []
        };
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    const sid = generateUUID();

    try {
        const { mapsUrl } = await req.json();
        if (!mapsUrl) return failedResponse("mapsUrl is required", sid);

        const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        const geminiKey = Deno.env.get('GEMINI_API_KEY');
        const groqKey = Deno.env.get('GROQ_API_KEY');
        if (!googleKey) return failedResponse("GOOGLE_PLACES_API_KEY not set", sid);
        if (!geminiKey) return failedResponse("GEMINI_API_KEY not set", sid);
        if (!groqKey) return failedResponse("GROQ_API_KEY not set", sid);

        console.log(`[${sid}] v4.0 Gemini-powered start`);

        // ── URL resolution ────────────────────────────────────────────────────
        let searchQuery = mapsUrl, coordsStr = "";
        if (mapsUrl.startsWith('http')) {
            try {
                // Use GET (not HEAD) — maps.app.goo.gl short URLs only redirect on GET
                const r = await fetch(mapsUrl, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) });
                const resolved = r.url;
                console.log(`[${sid}] Resolved URL: ${resolved.slice(0, 120)}`);
                const pm = resolved.match(/\/place\/([^/@?]+)/);
                if (pm?.[1]) searchQuery = decodeURIComponent(pm[1].replace(/\+/g, ' '));
                const cm = resolved.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                if (cm) coordsStr = `${cm[1]},${cm[2]}`;
                // Fallback: try extracting from query param
                if (searchQuery === mapsUrl) {
                    const qMatch = resolved.match(/[?&]q=([^&]+)/);
                    if (qMatch?.[1]) searchQuery = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
                }
            } catch { }
        }

        // ── Place lookup ──────────────────────────────────────────────────────
        const bias = coordsStr ? `&locationbias=circle:50@${coordsStr}` : "";
        const fp = await (await fetch(
            `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=place_id,name${bias}&key=${googleKey}`
        )).json();
        if (fp.status !== 'OK' || !fp.candidates?.length) return failedResponse(`Places lookup failed: ${fp.status}`, sid);
        const placeId = fp.candidates[0].place_id;

        // ── Place details (10 photos) ─────────────────────────────────────────
        const dd = await (await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,rating,user_ratings_total,reviews,photos&key=${googleKey}`
        )).json();
        if (dd.status !== 'OK') return failedResponse(`Place details failed: ${dd.status}`, sid);
        const place = dd.result;
        const placeName = place.name;
        const avgRating: number = place.rating || 0;
        const reviewCount: number = place.user_ratings_total || 0;

        const recentReviews = (place.reviews || [])
            .sort((a: any, b: any) => b.time - a.time)
            .slice(0, 10)
            .map((r: any) => ({
                author: r.author_name || "Anonymous",
                rating: r.rating || 0,
                text: r.text || "",
                date: new Date(r.time * 1000).toISOString().split('T')[0],
            }));

        // Fetch up to 10 photos in parallel
        const photoRefs = (place.photos || []).slice(0, 10).map((p: any) => p.photo_reference);
        const rawImages: { b64: string; idx: number }[] = [];

        await Promise.all(photoRefs.map(async (ref: string, i: number) => {
            try {
                const imgRes = await fetch(
                    `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1024&photo_reference=${ref}&key=${googleKey}`
                );
                if (imgRes.ok) {
                    const buf = await imgRes.arrayBuffer();
                    const u8 = new Uint8Array(buf);
                    let bin = '';
                    for (let j = 0; j < u8.byteLength; j += 1024)
                        bin += String.fromCharCode.apply(null, u8.subarray(j, j + 1024) as any);
                    rawImages.push({ b64: btoa(bin), idx: i + 1 });
                }
            } catch { }
        }));

        if (rawImages.length === 0) return failedResponse("No photos available for this listing.", sid);
        console.log(`[${sid}] ${rawImages.length} photos fetched`);


        // ── PHASE 1 (REMOVED) — No longer pre-filter; send ALL images to dense audit ──
        // The old quick-filter was causing false REJECTED_EXTERIOR on stores that DO have
        // interior shelves but whose Google Maps photos start with 1-2 exterior shots.
        //
        // New strategy: send ALL fetched images directly to Gemini dense audit.
        // Gemini naturally returns empty detections for exterior shots.
        // We aggregate results from images that actually have detections.

        console.log(`[${sid}] Skipping Phase 1 filter — sending all ${rawImages.length} images to dense audit.`);

        // ── PHASE 2: Dense Audit on ALL photos in parallel (up to 10) ───────────
        const auditResults = await Promise.all(
            rawImages.map(img => denseAudit(img.b64, img.idx, geminiKey))
        );

        const allDetections: Detection[] = auditResults.flatMap(r => r.detections);
        const totalProducts = allDetections.length;
        const imagesWithDetections = auditResults.filter(r => r.detections.length > 0).length;
        console.log(`[${sid}] P2: ${totalProducts} total detections across ${imagesWithDetections}/${rawImages.length} images`);

        if (totalProducts === 0) {
            // No products found in any image — return an empty but successful result
            return new Response(
                JSON.stringify({
                    success: true,
                    v4_gemini: true,
                    results: {
                        analysis_session_id: sid,
                        verification_status: "VERIFIED",
                        pipeline_version: "v4.0-Gemini-2.0-Flash",
                        place_name: placeName,
                        total_images_analyzed: imagesWithDetections,
                        total_products_detected: 0,
                        unique_brands_detected: 0,
                        store_footprint_index: "Low",
                        brands: [],
                        raw_detections: [],
                        audit_summary: auditResults.map(r => ({ image_index: r.idx, shelf_confidence: r.shelf_confidence, detections_count: 0 }))
                    }
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        // ── PHASE 3: Groq Aggregation (text-only) ────────────────────────────
        const aggregated = await aggregateBrands(allDetections, groqKey, { name: placeName, rating: avgRating });
        console.log(`[${sid}] P3: ${aggregated.unique_brands_list.length} unique brands after dedup`);

        // ── Data computations ────────────────────────────────────────────────
        const sentiment = analyzeReviewSentiment(recentReviews);
        const authenticityScore = computeAuthenticityScore(
            avgRating, reviewCount, sentiment,
            imagesWithDetections, aggregated.shelf_quality_score, aggregated.unique_brands_list.length
        );

        // ── Build final response ─────────────────────────────────────────────
        const finalResponse = {
            analysis_session_id: sid,
            verification_status: "VERIFIED",
            pipeline_version: "v4.0-Gemini-2.0-Flash",

            // Identity
            place_identity_lock: { name: placeName, address: place.formatted_address || "Unknown" },
            store_name_from_image: placeName,
            place_name: placeName,
            rating: avgRating,
            total_reviews: reviewCount,
            address: place.formatted_address || "",

            // Match old review_analysis block
            review_analysis: {
                average_rating: avgRating,
                total_reviews: reviewCount,
                sentiment: sentiment,
                recent_reviews: recentReviews,
            },

            // Match old vision_analysis block
            vision_analysis: {
                total_images_analyzed: imagesWithDetections,
                total_products_detected: aggregated.total_products_detected,
                unique_brands: aggregated.unique_brands_list,
                brand_distribution: aggregated.brand_distribution,
                category_presence: aggregated.category_presence,
                missing_categories: aggregated.missing_categories,
                shelf_quality_score: aggregated.shelf_quality_score,
                store_footprint_index: aggregated.store_footprint_index
            },

            // Authenticity Score matching
            authenticity_score: authenticityScore,
            authenticity_breakdown: {
                review_sentiment: Math.round((sentiment.positive_pct / 100) * 25),
                rating_score: Math.round((Math.min(avgRating, 5) / 5) * 20),
                image_presence: imagesWithDetections >= 4 ? 15 : imagesWithDetections >= 2 ? 10 : 5,
                brand_consistency: aggregated.unique_brands_list.length >= 8 ? 25 : aggregated.unique_brands_list.length >= 4 ? 18 : aggregated.unique_brands_list.length >= 2 ? 10 : 5,
                shelf_quality: Math.round((aggregated.shelf_quality_score / 100) * 15),
            },

            // AI Insights
            ai_insights: aggregated.ai_insights,

            // Raw fields for backward compatibility
            total_products_detected: aggregated.total_products_detected,
            unique_brands_detected: aggregated.unique_brands_list.length,
            brands: aggregated.unique_brands_list.map(b => ({ brand_name: b })),

            raw_detections: allDetections.map(d => ({
                label: d.label,
                category: d.category_guess,
                ocr_confidence: d.ocr_confidence,
                image_index: d.image_index,
                bounding_box: d.box_2d,
            })),
            audit_summary: auditResults.map(r => ({
                image_index: r.idx,
                shelf_confidence: r.shelf_confidence,
                detections_count: r.detections.length,
            })),
        };

        console.log(`[${sid}] Done. Brands: ${aggregated.unique_brands_list.length}, Products: ${totalProducts}`);
        return new Response(
            JSON.stringify({ success: true, v4_gemini: true, results: finalResponse }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (err: any) {
        console.error(`[${sid}] Fatal:`, err?.message);
        return new Response(JSON.stringify({
            success: false, v4_gemini: true, analysis_session_id: sid,
            verification_status: "FAILED", reason: err?.message || "Unknown server error",
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }
});
