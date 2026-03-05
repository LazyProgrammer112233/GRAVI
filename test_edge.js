import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iwdxokuakjshsagazjvu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3ZHhva3Vha2pzaHNhZ2F6anZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MzYyMjcsImV4cCI6MjA4NzQxMjIyN30.xJdmiWFrYruSiuK3f3LRc1_vUhNfNBcIsOimvPxNAhY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testEdge() {
    console.log("Invoking candidate-filtering...");
    const { data, error } = await supabase.functions.invoke('candidate-filtering', {
        body: {
            ocr_text: "Maggi",
            dominant_colors: ["yellow"],
            packaging_type: "Wrapper",
            barcode: ""
        }
    });

    if (error) {
        console.error("EDGE FUNCTION ERROR:", error);

        // Let's try to fetch it natively so we can see the exact response body text
        console.log("--- NATIVE FETCH FOR RAW ERROR ---");
        const res = await fetch(`${supabaseUrl}/functions/v1/candidate-filtering`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ ocr_text: "Maggi", dominant_colors: [], packaging_type: "", barcode: "" })
        });
        const text = await res.text();
        console.log("Raw Response Status:", res.status);
        console.log("Raw Response Body:", text);

    } else {
        console.log("EDGE FUNCTION SUCCESS:", data);
    }
}

testEdge();
