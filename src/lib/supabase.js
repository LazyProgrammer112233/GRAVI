import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iwdxokuakjshsagazjvu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3ZHhva3Vha2pzaHNhZ2F6anZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MzYyMjcsImV4cCI6MjA4NzQxMjIyN30.xJdmiWFrYruSiuK3f3LRc1_vUhNfNBcIsOimvPxNAhY';

export const supabase = createClient(supabaseUrl, supabaseKey);
