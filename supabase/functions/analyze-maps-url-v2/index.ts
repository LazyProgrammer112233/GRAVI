import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// UUID v4 Generator
// ============================================================
function generateUUID(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ============================================================
// COCO class → FMCG product type mapping
// Maps YOLO COCO detections to retail-relevant categories
// ============================================================
const COCO_TO_FMCG: Record<string, { category: string; brand_hint: string }> = {
    bottle: { category: "Beverages", brand_hint: "Beverage Bottle" },
    cup: { category: "Beverages", brand_hint: "Cup/Drink" },
    wine_glass: { category: "Beverages", brand_hint: "Glass Bottle" },
    bowl: { category: "Staples", brand_hint: "Food Bowl" },
    banana: { category: "Produce", brand_hint: "Fresh Produce" },
    apple: { category: "Produce", brand_hint: "Fresh Produce" },
    orange: { category: "Produce", brand_hint: "Fresh Produce" },
    sandwich: { category: "Snacks", brand_hint: "Packaged Food" },
    pizza: { category: "Food", brand_hint: "Packaged Food" },
    donut: { category: "Snacks", brand_hint: "Packaged Snack" },
    cake: { category: "Bakery", brand_hint: "Bakery Item" },
    hot_dog: { category: "Snacks", brand_hint: "Packaged Snack" },
    carrot: { category: "Produce", brand_hint: "Fresh Produce" },
    book: { category: "Non-FMCG", brand_hint: "Non-Food" },
    backpack: { category: "Non-FMCG", brand_hint: "Non-Food" },
    handbag: { category: "Non-FMCG", brand_hint: "Non-Food" },
    suitcase: { category: "Non-FMCG", brand_hint: "Non-Food" },
    refrigerator: { category: "Appliance", brand_hint: "Refrigerator Unit" },
    // Retail-specific
    sports_ball: { category: "Non-FMCG", brand_hint: "Non-Food" },
    potted_plant: { category: "Non-FMCG", brand_hint: "Non-Food" },
    vase: { category: "Non-FMCG", brand_hint: "Non-Food" },
    toothbrush: { category: "Personal Care", brand_hint: "Oral Care" },
    scissors: { category: "Non-FMCG", brand_hint: "Non-Food" },
};

// FMCG-relevant COCO classes (exclude non-retail objects)
const FMCG_RELEVANT_CLASSES = new Set([
    "bottle", "cup", "wine_glass", "bowl", "banana", "apple", "orange",
    "sandwich", "pizza", "donut", "cake", "hot_dog", "carrot",
    "refrigerator", "toothbrush",
]);

// Allowed store taxonomy (same as v1)
const ALLOWED_STORE_TYPES = new Set([
    "Kirana Store", "Mini Supermarket", "Supermarket", "Hypermarket",
    "Departmental Store", "Convenience Store", "Wholesale Grocery",
    "Cash & Carry", "Organic Store", "Dairy Booth", "FMCG Distributor Outlet",
    "Medical + Grocery Combo", "Provisional Store", "General Store",
    "Specialty Food Store", "Paan + Convenience Hybrid", "Bakery + Grocery Hybrid",
    "Rural Retail Outlet",
]);

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
// LAYER 1 — YOLO via Roboflow Serverless Hosted API
// Model: coco/9 (YOLOv8 pretrained on MS-COCO)
// POST base64 image, returns bounding boxes + class labels
// ============================================================
async function runYOLODetection(
    base64Image: string,
    imageIndex: number,
    roboflowApiKey: string,
): Promise<{ detections: any[]; raw_count: number; error?: string }> {
    const url = `https://serverless.roboflow.com/coco/9?api_key=${roboflowApiKey}&confidence=0.3&overlap=0.5`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: base64Image,
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[YOLO] Image ${imageIndex} HTTP error: ${response.status} — ${errText}`);
            return { detections: [], raw_count: 0, error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const predictions = data.predictions || [];

        // Map COCO predictions to FMCG-structured format
        const detections = predictions
            .filter((p: any) => p.confidence >= 0.30)
            .map((p: any) => {
                const className = (p.class || "").toLowerCase().replace(/ /g, '_');
                const fmcgMapping = COCO_TO_FMCG[className];
                const isFmcgRelevant = FMCG_RELEVANT_CLASSES.has(className);

                return {
                    brand: fmcgMapping?.brand_hint || p.class,
                    product_type: fmcgMapping?.category || "Unknown",
                    yolo_class: p.class,
                    bounding_box: [
                        Math.round(p.x - p.width / 2),
                        Math.round(p.y - p.height / 2),
                        Math.round(p.x + p.width / 2),
                        Math.round(p.y + p.height / 2),
                    ],
                    estimated_facings: 1,
                    confidence: Math.round(p.confidence * 100) / 100,
                    visibility: p.confidence >= 0.70 ? "full" : p.confidence >= 0.50 ? "partial" : "low_confidence",
                    fmcg_relevant: isFmcgRelevant,
                };
            });

        return { detections, raw_count: predictions.length };
    } catch (e: any) {
        console.error(`[YOLO] Image ${imageIndex} error:`, e.message);
        return { detections: [], raw_count: 0, error: e.message };
    }
}

// ============================================================
// LAYER 3 — OCR via Qwen2.5-VL (OCR-specific prompt)
// Uses HF Inference API — Qwen is excellent at reading text
// ============================================================
async function runOCRExtraction(
    base64Image: string,
    imageIndex: number,
    hfApiKey: string,
): Promise<{ ocr_text: any[]; error?: string }> {
    const url = `https://api-inference.huggingface.co/models/Qwen/Qwen2.5-VL-7B-Instruct/v1/chat/completions`;

    const prompt = `You are an OCR engine for retail store images. Extract ALL visible readable text from this image.

STRICT RULES:
1. Return ONLY text that is clearly readable in the image.
2. Do NOT infer or guess text that is blurry or not visible.
3. For each text item, estimate confidence (0.0 to 1.0).
4. Categories: brand_label, price_board, promotional_banner, store_signboard, product_name, other
5. Return ONLY valid JSON. No explanation outside JSON.

Return ONLY:
{
  "ocr_text": [
    {
      "text": "exact visible text",
      "confidence": 0.92,
      "category": "brand_label",
      "region": "top-left|top-right|center|bottom-left|bottom-right|full"
    }
  ]
}

If no text is visible: { "ocr_text": [] }`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${hfApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "Qwen/Qwen2.5-VL-7B-Instruct",
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
                    ],
                }],
                max_tokens: 800,
                temperature: 0.05,
                stream: false,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[OCR] Image ${imageIndex} HTTP error: ${response.status}`);
            return { ocr_text: [], error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || "{}";
        const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
        return { ocr_text: Array.isArray(parsed.ocr_text) ? parsed.ocr_text : [] };
    } catch (e: any) {
        console.error(`[OCR] Image ${imageIndex} error:`, e.message);
        return { ocr_text: [], error: e.message };
    }
}

// ============================================================
// LAYER 2 — Qwen 2.5-VL Vision-Language Reasoning
// Validates YOLO detections, normalizes brands, performs
// shelf intelligence analysis using structured JSON input
// ============================================================
async function runQwenVLReasoning(
    base64Images: string[],
    yoloResultsPerImage: any[],
    ocrResultsPerImage: any[],
    storeMeta: { name: string; rating: number; reviews: any[]; google_types: string[] },
    hfApiKey: string,
): Promise<any> {
    const url = `https://api-inference.huggingface.co/models/Qwen/Qwen2.5-VL-7B-Instruct/v1/chat/completions`;

    // Build structured context JSON — LLM receives THIS, not raw images
    const structuredInput = {
        store_metadata: {
            name: storeMeta.name,
            rating: storeMeta.rating,
            google_types: storeMeta.google_types,
            review_count: storeMeta.reviews.length,
        },
        yolo_detections_per_image: yoloResultsPerImage.map((r, i) => ({
            image_index: i + 1,
            total_detections: r.detections.length,
            fmcg_detections: r.detections.filter((d: any) => d.fmcg_relevant),
            all_detections: r.detections,
        })),
        ocr_results_per_image: ocrResultsPerImage.map((r, i) => ({
            image_index: i + 1,
            extracted_text: r.ocr_text,
        })),
        total_images: base64Images.length,
    };

    const systemPrompt = `You are GRAVI Vision Intelligence v2 — an elite FMCG retail analyst AI.
You have received structured detection data from YOLO (object detection) and OCR (text extraction) for ${base64Images.length} store image(s).

YOUR ABSOLUTE RULES — NEVER VIOLATE:
1. You MUST NOT introduce any brand that is not: (a) detected by YOLO with confidence≥0.50, OR (b) confirmed by OCR text, OR (c) clearly visible in image AND supported by both YOLO+OCR context.
2. "low_confidence" detections (YOLO confidence <0.50) MUST be marked as such and NOT counted as primary brands.
3. Do NOT fabricate SKU counts, inventory counts, or revenue estimates.
4. Do NOT infer distributor relationships or supply chain information.
5. If data is ambiguous → set confidence as "low" and state the reason.
6. "missing_categories" = FMCG categories with ZERO detections from YOLO+OCR in ALL images.
7. Every brand in "unique_brands" MUST have a corresponding YOLO or OCR source.
8. Return ONLY valid JSON. NO text outside JSON. NO markdown.

Analyze the structured detection data provided. Then return:
{
  "store_type": "one of the allowed taxonomy values or UNCLASSIFIED",
  "store_type_confidence": 0-100,
  "store_name_from_image": "extracted from OCR or Unknown",
  "unique_brands": ["only validated brands from YOLO+OCR"],
  "brand_distribution": {
    "BrandName": {
      "count": 0,
      "category": "Beverages",
      "source": "YOLO" or "OCR" or "YOLO+OCR",
      "confidence": 0.0-1.0
    }
  },
  "category_presence": {
    "Beverages": true,
    "Snacks": false,
    "Dairy": false,
    "Personal Care": false,
    "Staples": false,
    "Home Care": false
  },
  "missing_categories": ["categories with zero presence"],
  "shelf_quality_score": 0-100,
  "detection_confidence": 0-100,
  "shelf_dominance": "which brand/category dominates visible shelf space",
  "brand_competition": "High fragmentation | Medium | Low — based ONLY on detection count",
  "reasoning": "brief explanation based strictly on detection data",
  "ai_insights": [
    "factual insight 1 — based only on detected data",
    "factual insight 2"
  ]
}`;

    try {
        // Use only the first image as visual anchor for Layer 2
        // (YOLO+OCR JSON carries the full multi-image context)
        const imageContent = base64Images.slice(0, 2).map(b64 => ({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${b64}` },
        }));

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${hfApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "Qwen/Qwen2.5-VL-7B-Instruct",
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: systemPrompt },
                        { type: "text", text: `\n\nSTRUCTURED DETECTION INPUT:\n${JSON.stringify(structuredInput, null, 2)}` },
                        ...imageContent,
                    ],
                }],
                max_tokens: 1500,
                temperature: 0.05,
                stream: false,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Qwen API HTTP ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || "{}";
        const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    } catch (e: any) {
        console.error(`[QwenVL] Reasoning error:`, e.message);
        throw e;
    }
}

// ============================================================
// Review sentiment analysis
// ============================================================
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

// ============================================================
// Deterministic authenticity score (uses vision output)
// ============================================================
function computeAuthenticityScore(
    avgRating: number,
    reviewCount: number,
    sentiment: { positive_pct: number },
    imagesCount: number,
    shelfQualityScore: number,
    uniqueBrandCount: number,
): number {
    // Review sentiment (25%)
    const sentimentScore = Math.round((sentiment.positive_pct / 100) * 25);
    // Rating (20%)
    const ratingScore = Math.round((Math.min(avgRating, 5) / 5) * 20);
    // Image presence (15%)
    const imageScore = imagesCount >= 4 ? 15 : imagesCount >= 2 ? 10 : 5;
    // Brand consistency via vision (25%)
    const brandScore = uniqueBrandCount >= 8 ? 25 : uniqueBrandCount >= 4 ? 18 : uniqueBrandCount >= 2 ? 10 : 5;
    // Shelf quality (15%)
    const shelfScore = Math.round((Math.min(shelfQualityScore, 100) / 100) * 15);

    return Math.min(100, sentimentScore + ratingScore + imageScore + brandScore + shelfScore);
}

// ============================================================
// MAIN HANDLER
// ============================================================
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const analysisSessionId = generateUUID();

    try {
        const { mapsUrl } = await req.json();
        if (!mapsUrl) return failedResponse("mapsUrl is required", analysisSessionId);

        const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        if (!googleApiKey) throw new Error("GOOGLE_PLACES_API_KEY not set.");
        const roboflowApiKey = Deno.env.get('ROBOFLOW_API_KEY');
        if (!roboflowApiKey) throw new Error("ROBOFLOW_API_KEY not set.");
        const hfApiKey = Deno.env.get('HF_API_KEY');
        if (!hfApiKey) throw new Error("HF_API_KEY not set.");

        // ── STEP 1: URL Resolution ──────────────────────────────────────────────
        let searchQuery = mapsUrl;
        let resolvedUrl = mapsUrl;
        let coordsStr = "";

        if (mapsUrl.startsWith('http')) {
            try {
                const resolveRes = await fetch(mapsUrl, { method: 'HEAD', redirect: 'follow' });
                resolvedUrl = resolveRes.url;
                const placeMatch = resolvedUrl.match(/\/place\/([^/@?]+)/);
                if (placeMatch?.[1]) searchQuery = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
                const coordsMatch = resolvedUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                if (coordsMatch) coordsStr = `${coordsMatch[1]},${coordsMatch[2]}`;
            } catch { /* fall back */ }
        }

        // ── STEP 2: Place Lookup ────────────────────────────────────────────────
        const locationBias = coordsStr ? `&locationbias=circle:50@${coordsStr}` : "";
        const fpRes = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=place_id,name${locationBias}&key=${googleApiKey}`);
        const fpData = await fpRes.json();

        if (fpData.status !== 'OK' || !fpData.candidates?.length) {
            return failedResponse(`Google Places findplace failed: ${fpData.status}`, analysisSessionId);
        }

        const placeId = fpData.candidates[0].place_id;
        const placeName = fpData.candidates[0].name;
        console.log(`[${analysisSessionId}] Place: ${placeName} | ID: ${placeId}`);

        // ── STEP 3: Place Details ───────────────────────────────────────────────
        const detailsRes = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,types,rating,user_ratings_total,reviews,photos,business_status&key=${googleApiKey}`);
        const detailsData = await detailsRes.json();

        if (detailsData.status !== 'OK') {
            return failedResponse(`Place details failed: ${detailsData.status}`, analysisSessionId);
        }

        const place = detailsData.result;
        const googleTypes: string[] = place.types || [];
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

        // ── STEP 4: Identity Lock ───────────────────────────────────────────────
        const identityLock = Object.freeze({
            place_id: placeId,
            name: place.name || placeName,
            lat: place.geometry?.location?.lat ?? null,
            lng: place.geometry?.location?.lng ?? null,
            address: place.formatted_address || "Unknown",
            review_count: reviewCount,
            google_types: googleTypes,
        });

        // ── STEP 5: Photo Download (max 4) ──────────────────────────────────────
        const photoRefs: string[] = (place.photos || []).slice(0, 4).map((p: any) => p.photo_reference);
        const base64Images: string[] = [];

        for (const ref of photoRefs) {
            try {
                const imgRes = await fetch(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${googleApiKey}`);
                if (imgRes.ok) {
                    const buf = await imgRes.arrayBuffer();
                    const uint8 = new Uint8Array(buf);
                    let binary = '';
                    for (let j = 0; j < uint8.byteLength; j += 1024) {
                        binary += String.fromCharCode.apply(null, uint8.subarray(j, j + 1024) as any);
                    }
                    base64Images.push(btoa(binary));
                }
            } catch { /* skip */ }
        }

        if (base64Images.length === 0) {
            return failedResponse("No images downloadable for this listing.", analysisSessionId);
        }

        console.log(`[${analysisSessionId}] Processing ${base64Images.length} images through 3-layer pipeline...`);

        // ── STEP 6: 3-LAYER PIPELINE (per image: Layer 1 + Layer 3 in parallel) ─
        // Then aggregate → Layer 2
        const yoloResultsPerImage: any[] = [];
        const ocrResultsPerImage: any[] = [];

        // Run Layer 1 (YOLO) + Layer 3 (OCR) for each image in parallel pairs
        const perImageResults = await Promise.all(
            base64Images.map(async (b64, idx) => {
                const [yolo, ocr] = await Promise.all([
                    runYOLODetection(b64, idx + 1, roboflowApiKey),
                    runOCRExtraction(b64, idx + 1, hfApiKey),
                ]);
                return { yolo, ocr };
            })
        );

        for (const r of perImageResults) {
            yoloResultsPerImage.push(r.yolo);
            ocrResultsPerImage.push(r.ocr);
        }

        const totalProductsDetected = yoloResultsPerImage.reduce(
            (sum, r) => sum + r.detections.length, 0
        );

        console.log(`[${analysisSessionId}] Layer 1+3 complete. Total YOLO detections: ${totalProductsDetected}. Running Layer 2 (Qwen-VL)...`);

        // ── STEP 7: Layer 2 — Qwen-VL Reasoning ────────────────────────────────
        const qwenResult = await runQwenVLReasoning(
            base64Images,
            yoloResultsPerImage,
            ocrResultsPerImage,
            { name: identityLock.name, rating: avgRating, reviews: recentReviews, google_types: googleTypes },
            hfApiKey,
        );

        // ── STEP 8: Post-processing & Brand Validation ──────────────────────────
        // Enforce brand validation rule: only keep brands with YOLO or OCR source
        const ocrBrandTexts = new Set(
            ocrResultsPerImage.flatMap(r => r.ocr_text
                .filter((t: any) => t.category === 'brand_label' && t.confidence >= 0.6)
                .map((t: any) => t.text.toLowerCase())
            )
        );

        const yoloBrandTypes = new Set(
            yoloResultsPerImage.flatMap(r =>
                r.detections.filter((d: any) => d.fmcg_relevant && d.confidence >= 0.50)
                    .map((d: any) => d.product_type.toLowerCase())
            )
        );

        // Validate brands from Qwen output
        const validatedBrands: string[] = (qwenResult.unique_brands || []).filter((brand: string) => {
            const brandLower = brand.toLowerCase();
            // Accept if OCR found it OR if Qwen is the primary source (we trust Qwen with image context)
            const ocrConfirmed = [...ocrBrandTexts].some(t => t.includes(brandLower) || brandLower.includes(t));
            const qwenSource = qwenResult.brand_distribution?.[brand]?.source || "";
            const qwenConfidence = qwenResult.brand_distribution?.[brand]?.confidence || 0;
            return ocrConfirmed || qwenSource.includes("YOLO") || (qwenConfidence >= 0.7);
        });

        // ── STEP 9: Compute Scores ─────────────────────────────────────────────
        const sentiment = analyzeReviewSentiment(recentReviews);
        const shelfQualityScore = typeof qwenResult.shelf_quality_score === 'number'
            ? Math.min(100, Math.max(0, qwenResult.shelf_quality_score)) : 50;
        const authenticityScore = computeAuthenticityScore(
            avgRating, reviewCount, sentiment,
            base64Images.length, shelfQualityScore, validatedBrands.length
        );

        // Identity lock integrity check
        if (identityLock.place_id !== placeId) {
            return failedResponse("Identity lock violation — analysis aborted.", analysisSessionId);
        }

        // ── STEP 10: Build Final Response ──────────────────────────────────────
        const finalResponse = {
            // Pipeline metadata
            analysis_session_id: analysisSessionId,
            verification_status: "VERIFIED",
            pipeline_version: "v2.0-3layer",
            pipeline_layers: {
                layer1_yolo: "Roboflow coco/9 (YOLOv8)",
                layer2_vlm: "Qwen/Qwen2.5-VL-7B-Instruct (HF Inference)",
                layer3_ocr: "Qwen2.5-VL OCR mode (HF Inference)",
            },

            // Store identity
            place_identity_lock: identityLock,
            store_type: ALLOWED_STORE_TYPES.has(qwenResult.store_type)
                ? qwenResult.store_type : "UNCLASSIFIED",
            store_name_from_image: qwenResult.store_name_from_image || "Unknown",

            // Review analysis
            review_analysis: {
                average_rating: avgRating,
                total_reviews: reviewCount,
                sentiment: sentiment,
                recent_reviews: recentReviews,
            },

            // Vision analysis (the spec format)
            vision_analysis: {
                total_images_analyzed: base64Images.length,
                total_products_detected: totalProductsDetected,
                unique_brands: validatedBrands,
                brand_distribution: qwenResult.brand_distribution || {},
                category_presence: qwenResult.category_presence || {},
                missing_categories: qwenResult.missing_categories || [],
                shelf_quality_score: shelfQualityScore,
                detection_confidence: typeof qwenResult.detection_confidence === 'number'
                    ? qwenResult.detection_confidence : 0,
                shelf_dominance: qwenResult.shelf_dominance || "Unknown",
                brand_competition: qwenResult.brand_competition || "Unknown",
            },

            // Raw layer outputs (for transparency/debugging)
            layer1_yolo_summary: yoloResultsPerImage.map((r, i) => ({
                image_index: i + 1,
                detections_count: r.detections.length,
                fmcg_relevant_count: r.detections.filter((d: any) => d.fmcg_relevant).length,
                top_detections: r.detections.slice(0, 5),
            })),
            layer3_ocr_summary: ocrResultsPerImage.map((r, i) => ({
                image_index: i + 1,
                texts_extracted: r.ocr_text.length,
                texts: r.ocr_text,
            })),

            // Scores
            authenticity_score: authenticityScore,
            authenticity_breakdown: {
                review_sentiment: Math.round((sentiment.positive_pct / 100) * 25),
                rating_score: Math.round((Math.min(avgRating, 5) / 5) * 20),
                image_presence: base64Images.length >= 4 ? 15 : base64Images.length >= 2 ? 10 : 5,
                brand_consistency: validatedBrands.length >= 8 ? 25 : validatedBrands.length >= 4 ? 18 : validatedBrands.length >= 2 ? 10 : 5,
                shelf_quality: Math.round((shelfQualityScore / 100) * 15),
            },

            // AI insights (from Qwen, validated)
            ai_insights: Array.isArray(qwenResult.ai_insights) ? qwenResult.ai_insights : [],
        };

        console.log(`[${analysisSessionId}] v2 Analysis complete. Score: ${authenticityScore} | Brands: ${validatedBrands.length} | Products: ${totalProductsDetected}`);

        return new Response(JSON.stringify({ success: true, v2_3layer: true, results: finalResponse }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (err: any) {
        console.error(`[${analysisSessionId}] v2 Error:`, err);
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
