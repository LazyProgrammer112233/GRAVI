import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iwdxokuakjshsagazjvu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3ZHhva3Vha2pzaHNhZ2F6anZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MzYyMjcsImV4cCI6MjA4NzQxMjIyN30.xJdmiWFrYruSiuK3f3LRc1_vUhNfNBcIsOimvPxNAhY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log("Logging in as ishan@flick2know.com...");
    const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
        email: 'ishan@flick2know.com',
        password: 'ishan@fafa'
    });

    if (authError) {
        return console.error("Auth Failed:", authError.message);
    }

    console.log("Access Token:", session.access_token);

    console.log("Logged in! Calling LLaMA Scout Edge Function with User JWT...");
    const res = await fetch(`${supabaseUrl}/functions/v1/llama-scout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
            vision_metadata: { ocr_text: "Maggi", dominant_colors: [], packaging_type: "", barcode: "" },
            candidates: [
                { brand: "Nestle", sku: "Maggi 2-Minute Noodles", category: "Food" }
            ]
        })
    });

    console.log("Response Status:", res.status);
    console.log("Response Body:", await res.text());
}

test();
