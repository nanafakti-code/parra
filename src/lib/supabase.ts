import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.SUPABASE_URL || "";
const supabaseKey = import.meta.env.SUPABASE_ANON_KEY || "";
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL: SUPABASE_URL or SUPABASE_ANON_KEY is missing!');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Admin client for webhooks and background tasks (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);
