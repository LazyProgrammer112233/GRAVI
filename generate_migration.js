import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateMigration() {
    console.log("Reading schema.sql...");
    const schemaSql = fs.readFileSync(path.join(__dirname, 'supabase', 'schema.sql'), 'utf-8');

    console.log("Reading CSV...");
    const csvPath = path.join(__dirname, 'src', 'assets', 'India_FMCG_Master_320_SKUs.csv');
    const csvData = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvData.split('\n').filter(line => line.trim().length > 0);

    let insertStatements = `\n\n-- Populate FMCG initial data\nINSERT INTO public.fmcg_skus (brand, sku, category, typical_packaging, primary_color_cues, common_pack_sizes, indicative_barcode) VALUES\n`;

    const values = [];
    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(val => val.trim().replace(/'/g, "''"));
        if (row.length < 7) continue;

        values.push(`('${row[0]}', '${row[1]}', '${row[2]}', '${row[3]}', '${row[4]}', '${row[5]}', '${row[6]}')`);
    }

    insertStatements += values.join(',\n') + ';\n';

    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const migrationDir = path.join(__dirname, 'supabase', 'migrations');

    if (!fs.existsSync(migrationDir)) {
        fs.mkdirSync(migrationDir, { recursive: true });
    }

    const migrationFile = path.join(migrationDir, `${timestamp}_fmcg_init.sql`);

    let finalSql = schemaSql.replace(/CREATE TABLE fmcg_skus/g, 'CREATE TABLE public.fmcg_skus');
    finalSql = finalSql.replace(/ON fmcg_skus/g, 'ON public.fmcg_skus');
    finalSql = finalSql.replace(/ALTER TABLE fmcg_skus/g, 'ALTER TABLE public.fmcg_skus');

    finalSql += insertStatements;

    fs.writeFileSync(migrationFile, finalSql);
    console.log(`Successfully generated migration file: ${migrationFile}`);
}

generateMigration().catch(console.error);
