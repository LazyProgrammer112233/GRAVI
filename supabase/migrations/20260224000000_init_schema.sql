-- stores: To track map entity analyses
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    store_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- bulk_analyses: To track batch Drive folder runs
CREATE TABLE IF NOT EXISTS public.bulk_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_url TEXT NOT NULL,
    total_images INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- analysis_results: To store AI inferences
CREATE TABLE IF NOT EXISTS public.analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bulk_analysis_id UUID REFERENCES public.bulk_analyses(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    image_name TEXT NOT NULL, -- CRITICAL: Maps exactly to Google Drive filename
    is_valid_grocery_store BOOLEAN,
    store_type TEXT,
    store_type_confidence NUMERIC,
    estimated_store_size TEXT,
    visible_brands TEXT[],
    dominant_brand TEXT,
    ad_materials_detected TEXT[],
    category_detected TEXT,
    shelf_density_estimate TEXT,
    out_of_stock_signals TEXT,
    competitive_brand_presence TEXT,
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Ensure an analysis is linked to either a bulk batch or single store Map, but not both/neither
    CONSTRAINT valid_reference CHECK (
        (bulk_analysis_id IS NOT NULL AND store_id IS NULL) OR
        (bulk_analysis_id IS NULL AND store_id IS NOT NULL)
    )
);

-- Enable RLS (Row Level Security) and configure basic policies
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;

-- For demo purposes of this SaaS, let's allow authenticated users to view/insert
-- In production, these should be scoped to auth.uid() owner column if user accounts are implemented fully
CREATE POLICY "Allow public read access to stores" ON public.stores FOR SELECT USING (true);
CREATE POLICY "Allow anon insert to stores" ON public.stores FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read access to bulk_analyses" ON public.bulk_analyses FOR SELECT USING (true);
CREATE POLICY "Allow anon insert to bulk_analyses" ON public.bulk_analyses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update to bulk_analyses" ON public.bulk_analyses FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to analysis_results" ON public.analysis_results FOR SELECT USING (true);
CREATE POLICY "Allow anon insert to analysis_results" ON public.analysis_results FOR INSERT WITH CHECK (true);
