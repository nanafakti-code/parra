import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = import.meta.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseKey);
