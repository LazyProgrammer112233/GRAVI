import { createClient } from '@supabase/supabase-js';

// Route traffic through the Vercel/Vite reverse proxy to bypass ISP domain blocks
const supabaseUrl = '/api/supabase';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3ZHhva3Vha2pzaHNhZ2F6anZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MzYyMjcsImV4cCI6MjA4NzQxMjIyN30.xJdmiWFrYruSiuK3f3LRc1_vUhNfNBcIsOimvPxNAhY';

const customFetch = (url, options) => {
    // 15-second timeout to prevent indefinite hanging on bad networks
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000);
    return fetch(url, { ...options, signal: controller.signal })
        .catch(err => {
            // Ensure connection errors throw a recognizable Error, not just "Failed to fetch"
            if (err.name === 'AbortError') {
                throw new Error('Network timeout: Could not connect to authentication server. Please check your connection.');
            }
            if (err.message === 'Failed to fetch') {
                throw new Error('Network error: Unable to reach the server. Please check your WiFi or mobile data connection.');
            }
            throw err;
        })
        .finally(() => clearTimeout(id));
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'gravi-supabase-auth',
    },
    global: {
        fetch: customFetch,
    },
});
