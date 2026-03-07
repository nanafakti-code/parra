import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabase';

/**
 * GET /api/debug-maintenance
 * Endpoint temporal para depurar por qué el modo mantenimiento no funciona.
 * ELIMINAR después de resolver el problema.
 */
export const GET: APIRoute = async ({ request }) => {
    const results: Record<string, any> = {};

    // 1. Check env var
    results.envMaintenanceMode = import.meta.env.MAINTENANCE_MODE ?? 'NOT SET';
    results.supabaseUrl = import.meta.env.SUPABASE_URL ? 'SET' : 'NOT SET';
    results.supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET';
    results.supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET';

    // 2. Check site_settings table
    try {
        const { data, error, status, statusText } = await supabaseAdmin
            .from('site_settings')
            .select('*')
            .eq('key', 'maintenance_mode')
            .maybeSingle();

        results.dbQuery = {
            data,
            error: error ? { message: error.message, code: error.code, details: error.details } : null,
            status,
            statusText,
        };
    } catch (e: any) {
        results.dbQuery = { exception: e.message };
    }

    // 3. Check all site_settings
    try {
        const { data, error } = await supabaseAdmin
            .from('site_settings')
            .select('key, value');
        results.allSettings = data;
        results.allSettingsError = error ? error.message : null;
    } catch (e: any) {
        results.allSettings = { exception: e.message };
    }

    // 4. Hostname info
    const url = new URL(request.url);
    results.hostname = url.hostname;
    results.isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    return new Response(JSON.stringify(results, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
