import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse, logAdminAction } from '../../../lib/admin';

/** GET /api/admin/settings – Get all site settings */
export const GET: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;

    const { data, error } = await supabaseAdmin
        .from('site_settings')
        .select('*')
        .order('key');

    if (error) return jsonResponse({ error: 'Error al obtener ajustes' }, 500);

    // Transform array into map
    const settings: Record<string, any> = {};
    (data || []).forEach(row => { settings[row.key] = row.value; });

    return jsonResponse({ settings });
};

/** PATCH /api/admin/settings – Update one or more settings */
export const PATCH: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { key, value } = body;

        if (!key || value === undefined) {
            return jsonResponse({ error: 'key y value obligatorios' }, 400);
        }

        const { data, error } = await supabaseAdmin
            .from('site_settings')
            .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
            .select()
            .single();

        if (error) {
            console.error('[settings] Upsert error:', error);
            return jsonResponse({ error: 'Error al guardar ajuste' }, 500);
        }

        await logAdminAction(admin.id, 'update_setting', 'site_setting', undefined, { key, value }, request.headers.get('x-forwarded-for') || undefined);
        return jsonResponse({ setting: data, message: 'Ajuste guardado' });
    } catch (err) {
        console.error('[settings] Catch error:', err);
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};
