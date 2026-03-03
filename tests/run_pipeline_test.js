import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase URL or Key in environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
    console.log("=== GRAVI Phase 3 Pipeline Test ===");

    const mockVisionData = {
        ocr_text: "Maggi 2-Minute Noodles",
        dominant_colors: ["yellow", "red"],
        packaging_type: "Wrapper",
        barcode: "89010" // Partial mock match
    };

    console.log("1. Sending visual metadata to Candidate Filtering Edge Function...");
    const { data: candidates, error: candidateError } = await supabase.functions.invoke('candidate-filtering', {
        body: mockVisionData
    });

    if (candidateError) {
        console.error("❌ Candidate Filtering Failed:", candidateError);
        process.exit(1);
    }

    console.log("✅ Candidate Filtering Success. Returned Top 5:");
    console.log(candidates.map(c => `   - [Score ${c.score}] ${c.brand} - ${c.sku}`));

    console.log("\n2. Sending Candidates to LLaMA 4 Scout Edge Function...");
    const { data: llmResult, error: llmError } = await supabase.functions.invoke('llama-scout', {
        body: {
            candidates: candidates,
            vision_metadata: mockVisionData
        }
    });

    if (llmError) {
        console.error("❌ LLM Verification Failed:", llmError);
        process.exit(1);
    }

    console.log("✅ LLaMA 4 Scout Success. Strict Validated JSON Output:");
    console.log(JSON.stringify(llmResult, null, 2));

    if (llmResult.brand && llmResult.sku && typeof llmResult.confidence === 'number') {
        console.log("\n🚀 Full Pipeline Validation PASSED.");
    } else {
        console.error("\n❌ Pipeline Validation FAILED. JSON structure missing required strictly closed-world keys.");
        process.exit(1);
    }
}

runTest().catch(console.error);
