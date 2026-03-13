import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.SUPABASE_URL || "";
const supabaseKey = import.meta.env.SUPABASE_ANON_KEY || "";
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL: SUPABASE_URL or SUPABASE_ANON_KEY is missing!');
}

if (!supabaseServiceKey) {
    throw new Error(
        'CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing. ' +
        'The server cannot start safely — supabaseAdmin would fallback to the anon key and bypass all RLS policies.',
    );
}

// SSR-safe options: disable session persistence and auto-refresh to prevent
// state pollution between requests and background token rotation that would
// consume browser refresh tokens without updating their cookies.
const ssrAuthOptions = {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
} as const;

export const supabase = createClient(supabaseUrl, supabaseKey, ssrAuthOptions);

// Admin client for webhooks and background tasks (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, ssrAuthOptions);
