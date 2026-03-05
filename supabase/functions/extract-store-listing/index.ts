import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ────────────────────────────────────────────────────────────────
// Strict Validation: Resolve a Google Maps URL to a place_id
// The URL can be a short link (maps.app.goo.gl) or a full URL.
// We parse the CID or path name to call Places API Text Search.
// ────────────────────────────────────────────────────────────────
async function resolveToPlaceId(mapsUrl: string, googleApiKey: string): Promise<string> {
  // 1. Follow any short URL redirect to get the canonical URL
  let canonicalUrl = mapsUrl;
  if (mapsUrl.includes('goo.gl') || mapsUrl.includes('maps.app.goo.gl')) {
    const resp = await fetch(mapsUrl, { redirect: 'follow' });
    canonicalUrl = resp.url;
    console.log("Canonical URL:", canonicalUrl);
  }

  // 2. Extract CID from URL if present (e.g. 1s0x...!2s...)
  // Pattern: /maps/place/<name>/@lat,lng,...
  // Or: /maps/place/<name>/data=...,<CID>
  // Try to get the place name from the path for a text search
  const placeNameMatch = canonicalUrl.match(/\/maps\/place\/([^/@]+)/);
  const rawPlaceName = placeNameMatch ? decodeURIComponent(placeNameMatch[1].replace(/\+/g, ' ')) : null;

  if (!rawPlaceName) {
    throw new Error(`Cannot parse place name from URL: ${canonicalUrl}`);
  }

  // Remove "+" and clean up
  const placeName = rawPlaceName.replace(/\+/g, ' ').replace(/_/g, ' ').trim();
  console.log("Place search term:", placeName);

  // 3. Use Google Places Text Search to get place_id
  const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(placeName)}&key=${googleApiKey}`;
  const searchResp = await fetch(textSearchUrl);
  const searchData = await searchResp.json();

  if (!searchData.results || searchData.results.length === 0) {
    throw new Error(`No Places results found for: "${placeName}". Strict validation failed.`);
  }

  const place_id = searchData.results[0].place_id;
  console.log("Resolved place_id:", place_id, "for:", searchData.results[0].name);
  return place_id;
}

// ────────────────────────────────────────────────────────────────
// Fetch full place details using place_id (strictly verified)
// ────────────────────────────────────────────────────────────────
async function fetchPlaceDetails(place_id: string, googleApiKey: string) {
  const fields = 'name,rating,user_ratings_total,formatted_address,photos,reviews,url';
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=${fields}&key=${googleApiKey}`;
  const resp = await fetch(detailsUrl);
  const data = await resp.json();

  if (!data.result) {
    throw new Error(`Place Details fetch failed for place_id: ${place_id}`);
  }
  return data.result;
}

// ────────────────────────────────────────────────────────────────
// Run Groq LLaMA Vision OCR on a Google Photos URL
// Uses the free Groq API with llama-4-scout-17b-16e-instruct
// ────────────────────────────────────────────────────────────────
async function runGroqVision(photoUrl: string, groqApiKey: string): Promise<string> {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqApiKey}`
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: photoUrl }
            },
            {
              type: 'text',
              text: 'You are a strict retail auditor. List ALL visible product brand names, SKU/product names, and packaging text visible in this image. Only state what you STRICTLY see. Format: comma-separated list of brand names and product names. Do not guess or generate from memory.'
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 512
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.warn("Groq Vision failed:", errText);
    return "";
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

// ────────────────────────────────────────────────────────────────
// Main Edge Function Handler
// ────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url: mapsUrl } = await req.json();

    if (!mapsUrl) {
      throw new Error('A Google Maps URL is required.');
    }

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_PLACES_API_KEY secret is not set in Supabase Edge Function secrets.');
    }

    // ── Step 1: Resolve URL to place_id ──────────────────────
    console.log("Step 1: Resolving URL to place_id...");
    const place_id = await resolveToPlaceId(mapsUrl, GOOGLE_API_KEY);

    // ── Step 2: Fetch real place details ─────────────────────
    console.log("Step 2: Fetching Place Details...");
    const place = await fetchPlaceDetails(place_id, GOOGLE_API_KEY);

    // ── Step 3: Get photo URLs from Places API ────────────────
    console.log("Step 3: Extracting photo references...");
    const photoRefs: string[] = (place.photos || []).slice(0, 3).map((p: any) => p.photo_reference);
    const photoUrls: string[] = photoRefs.map(ref =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${ref}&key=${GOOGLE_API_KEY}`
    );

    // ── Step 4: Run Groq Vision OCR on each photo ────────────
    let allOcrText = "";
    if (GROQ_API_KEY && photoUrls.length > 0) {
      console.log(`Step 4: Running Groq Vision on ${photoUrls.length} photos...`);
      const ocrResults = await Promise.allSettled(
        photoUrls.map(url => runGroqVision(url, GROQ_API_KEY))
      );
      allOcrText = ocrResults
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<string>).value)
        .join(', ');
      console.log("Combined OCR Text:", allOcrText);
    }

    // ── Step 5: Extract recent review snippets ────────────────
    const reviewSnippets: string[] = (place.reviews || []).slice(0, 5).map((r: any) => r.text);

    // ── Step 6: Assemble strict validated payload ─────────────
    const payload = {
      place_id,
      store_name: place.name,
      address: place.formatted_address,
      rating: place.rating || 0,
      total_reviews: place.user_ratings_total || 0,
      photos_analyzed: photoUrls.length,
      image_urls: photoUrls,
      reviews: reviewSnippets,
      ocr_text: allOcrText,
      dominant_colors: [],  // Can be computed later from pixel analysis
      packaging_type: "Unknown",
      barcode: ""
    };

    console.log("✅ Strict validation complete. Returning payload for:", place.name);

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("extract-store-listing error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})
