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
// PHASE 3 — Groq Aggregation (TEXT ONLY — blind to image)
// ──────────────────────────────────────────────────────────────────────────────
async function aggregateBrands(allDetections: Detection[], groqKey: string): Promise<{
    total_products_detected: number;
    unique_brands_list: any[];
    store_footprint_index: string;
}> {
    if (allDetections.length === 0) {
        return { total_products_detected: 0, unique_brands_list: [], store_footprint_index: "Low" };
    }

    const rawInput = allDetections.map(d => ({
        label: d.label,
        category: d.category_guess,
        confidence: d.ocr_confidence,
    }));

    const prompt = `You are the GRAVI Aggregation Layer. You receive raw JSON from multiple vision passes.
Your job: clean, deduplicate, and produce a final retail audit report.

Input Data:
${JSON.stringify(rawInput)}

Processing Rules:
1. Normalization: Convert brand variations to standard name (e.g., "COKE", "CocaCola" → "Coca Cola"; "Britania" → "Britannia")
2. Deduplication: Same brand = one entry, multiple sightings = increase product_count
3. Validation: Discard common nouns ("Sugar", "Milk") unless confidence >= 0.85
4. No Hallucination: You have NO image access. Work ONLY with provided text.

Return ONLY valid JSON:
{
  "total_products_detected": 28,
  "unique_brands_list": [
    {"brand_name": "Parle-G", "product_count": 5, "category": "Snacks"},
    {"brand_name": "Britannia", "product_count": 3, "category": "Bakery"}
  ],
  "store_footprint_index": "High"
}

store_footprint_index: "Low" (<10 total products), "Medium" (10-25), "High" (>25)`;

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
            store_footprint_index: parsed.store_footprint_index || "Low",
        };
    } catch {
        // Fallback: manual dedup
        const countMap: Record<string, { count: number; category: string }> = {};
        for (const d of allDetections) {
            const key = d.label.toLowerCase().trim();
            if (!countMap[key]) countMap[key] = { count: 0, category: d.category_guess };
            countMap[key].count++;
        }
        const unique_brands_list = Object.entries(countMap).map(([k, v]) => ({
            brand_name: k.charAt(0).toUpperCase() + k.slice(1), product_count: v.count, category: v.category
        }));
        return {
            total_products_detected: allDetections.length,
            unique_brands_list,
            store_footprint_index: allDetections.length > 25 ? "High" : allDetections.length > 10 ? "Medium" : "Low",
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
        const aggregated = await aggregateBrands(allDetections, groqKey);
        console.log(`[${sid}] P3: ${aggregated.unique_brands_list.length} unique brands after dedup`);



        // ── Build final response ─────────────────────────────────────────────
        const finalResponse = {
            analysis_session_id: sid,
            verification_status: "VERIFIED",
            pipeline_version: "v4.0-Gemini-2.0-Flash",
            place_name: placeName,
            rating: place.rating || 0,
            total_reviews: place.user_ratings_total || 0,
            address: place.formatted_address || "",
            total_images_analyzed: imagesWithDetections,
            total_products_detected: aggregated.total_products_detected,
            unique_brands_detected: aggregated.unique_brands_list.length,
            store_footprint_index: aggregated.store_footprint_index,
            brands: aggregated.unique_brands_list,
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
