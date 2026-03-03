-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the table for our FMCG dataset
CREATE TABLE fmcg_skus (
  id BIGSERIAL PRIMARY KEY,
  brand TEXT,
  sku TEXT,
  category TEXT,
  typical_packaging TEXT,
  primary_color_cues TEXT,
  common_pack_sizes TEXT,
  indicative_barcode TEXT,
  -- Optional: column to store vector embeddings for semantic search
  embedding vector(384) 
);

-- Enable Row Level Security (RLS) and configure access rules
ALTER TABLE fmcg_skus ENABLE ROW LEVEL SECURITY;

-- Allow edge functions and anonymous users (if needed) to read the table
CREATE POLICY "Allow public read access"
  ON fmcg_skus
  FOR SELECT
  USING (true);
