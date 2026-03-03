import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Configure dotenv to read from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
// Depending on user config they may need a service_role key to bypass RLS for inserts
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase URL or Key in environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function uploadCSV() {
    const csvPath = path.join(__dirname, 'src', 'assets', 'India_FMCG_Master_320_SKUs.csv');

    if (!fs.existsSync(csvPath)) {
        console.error(`CSV File not found at ${csvPath}`);
        return;
    }

    const csvData = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvData.split('\n').filter(line => line.trim().length > 0);

    // Skip header line
    const headers = lines[0].split(',');
    console.log(`Found headers: ${headers.join(', ')}`);

    const records = [];

    for (let i = 1; i < lines.length; i++) {
        // Simple CSV parse handling commas inside quotes if any, otherwise standard split
        const values = lines[i].split(',').map(val => val.trim());
        if (values.length < 7) continue;

        records.push({
            brand: values[0],
            sku: values[1],
            category: values[2],
            typical_packaging: values[3],
            primary_color_cues: values[4],
            common_pack_sizes: values[5],
            indicative_barcode: values[6]
        });
    }

    console.log(`Parsed ${records.length} SKUs from CSV.`);

    console.log("Emptying old records...");
    // Clear out the table if running a fresh upload (optional, assuming we want a clean slate)
    await supabase.from('fmcg_skus').delete().neq('id', 0);

    console.log("Uploading to Supabase...");

    // Batch insert in chunks of 100 to avoid request size limits
    const chunkSize = 100;
    for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await supabase.from('fmcg_skus').insert(chunk);

        if (error) {
            console.error(`Error uploading chunk ${i}:`, error.message);
        } else {
            console.log(`Successfully uploaded batch ${i} to ${i + chunk.length}`);
        }
    }

    console.log("Upload Complete!");
}

uploadCSV().catch(console.error);
