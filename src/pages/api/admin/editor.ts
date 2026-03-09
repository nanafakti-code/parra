import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse, logAdminAction } from '../../../lib/admin';

/** GET /api/admin/editor?page=home */
export const GET: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;

    const url = new URL(request.url);
    const pageKey = url.searchParams.get('page');

    if (pageKey) {
        const { data, error } = await supabaseAdmin
            .from('page_settings')
            .select('*')
            .eq('page_key', pageKey)
            .single();
        if (error) return jsonResponse({ error: 'Página no encontrada' }, 404);
        return jsonResponse({ page: data });
    }

    // List all pages
    const { data, error } = await supabaseAdmin
        .from('page_settings')
        .select('*')
        .order('page_key');
    if (error) return jsonResponse({ error: 'Error al obtener páginas' }, 500);
    return jsonResponse({ pages: data || [] });
};

/** PATCH /api/admin/editor – Update page settings */
export const PATCH: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { pageKey, settings } = body;

        if (!pageKey || !settings) {
            return jsonResponse({ error: 'pageKey y settings obligatorios' }, 400);
        }

        const { data, error } = await supabaseAdmin
            .from('page_settings')
            .upsert({ page_key: pageKey, settings, updated_at: new Date().toISOString() }, { onConflict: 'page_key' })
            .select()
            .single();

        if (error) return jsonResponse({ error: 'Error al guardar página' }, 500);

        await logAdminAction(admin.id, 'update_page', 'page_settings', pageKey, { settings }, request.headers.get('x-forwarded-for') || undefined);
        return jsonResponse({ page: data, message: 'Página actualizada' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};
