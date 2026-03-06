import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const { ocr_text, packaging_type, dominant_colors, barcode } = await req.json()

        if (!ocr_text && !barcode) {
            // No evidence from OCR or barcode — return empty so llama-scout
            // doesn't match ghost candidates and hallucinates brands.
            console.log("[candidate-filtering] No OCR text or barcode — returning empty candidates.")
            return new Response(JSON.stringify([]), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Sanitize OCR text: remove special SQL characters, split on spaces AND commas
        // Groq Vision often returns "Brand1, Brand2, Product Name" so we split on both
        const rawTerms = ocr_text
            ? ocr_text
                .replace(/[()"'%_\\]/g, '')  // Remove SQL special chars
                .split(/[,\s]+/)             // Split on commas and spaces
                .map((w: string) => w.trim())
                .filter((w: string) => w.length > 3)  // Min 4 chars to avoid noise
            : []

        // De-duplicate terms
        const searchTerms = [...new Set(rawTerms)].map((w: string) => `%${w}%`)

        // Fallback if OCR is just a single word or empty after sanitization
        if (searchTerms.length === 0 && ocr_text && ocr_text.trim().length > 3) {
            const cleaned = ocr_text.replace(/[()"'%_\\,]/g, '').trim()
            if (cleaned) searchTerms.push(`%${cleaned}%`)
        }

        // Step 1: Base Query builder
        let query = supabaseClient.from('fmcg_skus').select('*')

        // Apply Barcode rigid filter first if present
        if (barcode) {
            query = query.ilike('indicative_barcode', `${barcode}%`)
        } else if (searchTerms.length > 0) {
            // Apply text matching. Supabase JS 'or' expects a comma separated string
            // We construct: brand.ilike.%term1%, sku.ilike.%term1%, brand.ilike.%term2% ...
            let orConditions: string[] = []
            for (const term of searchTerms) {
                orConditions.push(`brand.ilike.${term}`)
                orConditions.push(`sku.ilike.${term}`)
            }

            if (orConditions.length > 0) {
                query = query.or(orConditions.join(','))
            }
        }

        // Step 2: Fetch Potential matches (Keep it wide to analyze in-memory edge side)
        const { data: potentialMatches, error } = await query.limit(50)

        if (error) throw error

        // Step 3: Candidate Scoring (Edge Function Logic)
        let scoredCandidates = []

        for (const item of potentialMatches || []) {
            let score = 0

            // Brand Match (+20)
            if (ocr_text && item.brand && ocr_text.toLowerCase().includes(item.brand.toLowerCase())) {
                score += 20
            }

            // SKU/Text Match (+40) - rudimentary check
            if (ocr_text && item.sku) {
                const skuWords = item.sku.toLowerCase().split(' ')
                const matchCount = skuWords.filter(w => ocr_text.toLowerCase().includes(w)).length
                score += (matchCount / skuWords.length) * 40
            }

            // Packaging Filter (+15)
            if (packaging_type && item.typical_packaging) {
                if (item.typical_packaging.toLowerCase().includes(packaging_type.toLowerCase())) {
                    score += 15
                } else if (packaging_type.toLowerCase() === 'bottle' && item.typical_packaging.toLowerCase().includes('wrapper')) {
                    score -= 30 // Heavy penalty for impossible physics (Liquid vs Biscuit)
                }
            }

            // Color Match (+15)
            if (dominant_colors && item.primary_color_cues) {
                for (const color of dominant_colors) {
                    if (item.primary_color_cues.toLowerCase().includes(color.toLowerCase())) {
                        score += 15
                        break // Only award once
                    }
                }
            }

            // Barcode Match (+10)
            if (barcode && item.indicative_barcode && item.indicative_barcode.startsWith(barcode)) {
                score += 10
            }

            scoredCandidates.push({
                ...item,
                score
            })
        }

        // Sort descending by score
        scoredCandidates.sort((a, b) => b.score - a.score)

        // Return strictly Top 5
        const top5 = scoredCandidates.slice(0, 5)

        return new Response(
            JSON.stringify(top5),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
