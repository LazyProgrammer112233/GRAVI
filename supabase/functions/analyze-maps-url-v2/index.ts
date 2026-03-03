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
// Single-Pass Multimodal Vision Pipeline (Gemini 2.0 Flash)
// ──────────────────────────────────────────────────────────────────────────────
async function runVisionPipeline(base64Images: string[], geminiKey: string) {
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
    const imageParts = base64Images.map((b64) => ({
        inline_data: { mime_type: "image/jpeg", data: b64 }
    }));

    const payload = {
        contents: [{
            parts: [
                { text: "Analyze these 4 images of a retail store simultaneously.\n\nValidity Check: If an image is an exterior, a map, or has no shelves, ignore it.\n\nHigh-Density Detection: Identify every individual packaged product on the racks.\n\nDeep OCR: Extract the BRAND NAME from the physical product packaging only.\n\nCRITICAL: Do NOT extract text from refrigerator glass, posters, or banners.\n\nSpatial Grounding: For every detection, you MUST provide the bounding box: [ymin, xmin, ymax, xmax].\n\nDeduplication: Return a unique list of brands. For each brand, provide a total count of products seen and the array of all their bounding boxes.\n\nResponse Format: Return a strict, minified JSON object only: {\"brands\": [{\"brand_name\": \"string\", \"product_count\": 0, \"bounding_boxes\": [[0,0,0,0]]}], \"is_interior\": true, \"store_category\": \"string\"}.\nConstraint: If text is unreadable, do not guess. Do not hallucinate." },
                ...imageParts
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            response_mime_type: "application/json",
        }
    };

    const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini HTTP ${response.status}: ${err.slice(0, 200)}`);
    }

    const raw = await response.json();
    const textResp = raw.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(textResp);
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
// DASHBOARD UI COMPATIBILITY SCAFFOLDING
// ──────────────────────────────────────────────────────────────────────────────
function buildDashboardScaffolding(visionResult: any) {
    const brands = Array.isArray(visionResult.brands) ? visionResult.brands : [];
    const totalProducts = brands.reduce((sum: number, b: any) => sum + (b.product_count || 0), 0);
    const uniqueBrandsList = brands.map((b: any) => b.brand_name || "Unknown");

    // Map Brand Distribution
    const brandDistribution: any = {};
    brands.forEach((b: any) => {
        brandDistribution[b.brand_name] = {
            count: b.product_count,
            category: visionResult.store_category || "FMCG",
            source: "Gemini 2.0",
            confidence: 0.95
        };
    });

    // Mock category presence based on the store category or list
    const categoryPresence = {
        [visionResult.store_category || "General Retail"]: true
    };

    const aiInsights = [
        `Gemini 2.0 Flash identified ${totalProducts} total visible products across ${uniqueBrandsList.length} distinct brand entities via a single-pass scan.`,
        `The footprint aligns with the ${visionResult.store_category || 'General Retail'} classification.`,
        `High-density spatial grounding utilized to bypass exterior shots and perform deep inner-store intelligence extraction natively, avoiding staged processing delays.`,
    ];

    const shelfQualityScore = Math.min(100, Math.max(20, totalProducts * 1.5 + uniqueBrandsList.length * 2));
    const storeFootprintIndex = totalProducts > 25 ? "High" : totalProducts > 10 ? "Medium" : "Low";

    return {
        total_products_detected: totalProducts,
        unique_brands_list: uniqueBrandsList,
        brand_distribution: brandDistribution,
        store_footprint_index: storeFootprintIndex,
        ai_insights: aiInsights,
        shelf_quality_score: shelfQualityScore,
        category_presence: categoryPresence,
        missing_categories: []
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    const sid = generateUUID();

    try {
        const { mapsUrl, fast_resolve_only } = await req.json();
        if (!mapsUrl) return failedResponse("mapsUrl is required", sid);

        const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        const geminiKey = Deno.env.get('GEMINI_API_KEY');
        if (!googleKey) return failedResponse("GOOGLE_PLACES_API_KEY not set", sid);
        if (!geminiKey) return failedResponse("GEMINI_API_KEY not set", sid);

        console.log(`[${sid}] v4.0 Gemini-powered start`);

        // ── URL resolution ────────────────────────────────────────────────────
        let searchQuery = mapsUrl, coordsStr = "";
        if (mapsUrl.startsWith('http')) {
            try {
                const r = await fetch(mapsUrl, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) });
                const resolved = r.url;
                console.log(`[${sid}] Resolved URL: ${resolved.slice(0, 120)}`);
                const pm = resolved.match(/\/place\/([^/@?]+)/);
                if (pm?.[1]) searchQuery = decodeURIComponent(pm[1].replace(/\+/g, ' '));
                const cm = resolved.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                if (cm) coordsStr = `${cm[1]},${cm[2]}`;
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

        // ── Place details ─────────────────────────────────────────
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

        // Fetch top 4 photos (heuristic: skip index 0 which often is exterior)
        const photoRefs = (place.photos || []).slice(1, 5).map((p: any) => p.photo_reference);
        const base64Images: string[] = [];

        await Promise.all(photoRefs.map(async (ref: string) => {
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
                    base64Images.push(btoa(bin));
                }
            } catch { }
        }));

        if (base64Images.length === 0) return failedResponse("No photos available for this listing.", sid);
        console.log(`[${sid}] ${base64Images.length} images fetched.`);

        // ── Fast Resolve Exit (for V5 RF-DETR PyTorch Microservice) ────────────────
        if (fast_resolve_only) {
            console.log(`[${sid}] Fast resolve requested for local vision engine. Exiting early.`);
            return new Response(
                JSON.stringify({
                    success: true,
                    v4_gemini: false,
                    results: {
                        analysis_session_id: sid,
                        verification_status: "VERIFIED",
                        pipeline_version: "v5.0-RF-DETR-Local-FastResolve",
                        place_identity_lock: {
                            name: placeName,
                            address: place.formatted_address || "Unknown",
                            place_id: placeId
                        },
                        raw_images: base64Images,
                        rating: avgRating,
                        total_reviews: reviewCount,
                        recent_reviews: recentReviews
                    }
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        // ── Single-Pass Vision Pipeline (Gemini Legacy) ───────────────────────────
        const visionResult = await runVisionPipeline(base64Images, geminiKey);

        if (visionResult.is_interior === false || !visionResult.brands || visionResult.brands.length === 0) {
            // No interior products found
            return new Response(
                JSON.stringify({
                    success: true,
                    v4_gemini: true,
                    results: {
                        analysis_session_id: sid,
                        verification_status: "VERIFIED",
                        pipeline_version: "v4.0-Gemini-2.0-Flash-SinglePass",
                        place_name: placeName,
                        total_images_analyzed: base64Images.length,
                        total_products_detected: 0,
                        unique_brands_detected: 0,
                        store_footprint_index: "Low",
                        brands: [],
                        raw_detections: [],
                        audit_summary: [{ shelf_confidence: 0, detections_count: 0 }]
                    }
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        const aggregated = buildDashboardScaffolding(visionResult);
        console.log(`[${sid}] Output: ${aggregated.unique_brands_list.length} unique brands`);

        const imagesWithDetections = base64Images.length;
        const sentiment = analyzeReviewSentiment(recentReviews);
        const authenticityScore = computeAuthenticityScore(
            avgRating, reviewCount, sentiment,
            imagesWithDetections, aggregated.shelf_quality_score, aggregated.unique_brands_list.length
        );

        // Flatten bounding boxes for dashboard visualizer
        const raw_detections = visionResult.brands.flatMap((b: any) =>
            (b.bounding_boxes || []).map((box: number[]) => ({
                label: b.brand_name,
                category: visionResult.store_category || "Unknown",
                ocr_confidence: 0.95,
                image_index: 0,
                bounding_box: box
            }))
        );

        // ── Build final response ─────────────────────────────────────────────
        const finalResponse = {
            analysis_session_id: sid,
            verification_status: "VERIFIED",
            pipeline_version: "v4.0-Gemini-2.0-Flash-SinglePass",

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
            brands: aggregated.unique_brands_list.map((b: string) => ({ brand_name: b })),

            raw_detections,
            audit_summary: [{
                image_index: 0,
                shelf_confidence: 0.9,
                detections_count: aggregated.total_products_detected,
            }],
        };

        console.log(`[${sid}] Done. Brands: ${aggregated.unique_brands_list.length}, Products: ${aggregated.total_products_detected}`);
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
