import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse, logAdminAction } from '../../../lib/admin';

// Reemplaza recursivamente un valor hex en cualquier JSONB anidado
function replaceColorInContent(obj: unknown, oldHex: string, newHex: string): unknown {
    const old = oldHex.toLowerCase();
    if (typeof obj === 'string') {
        return obj.toLowerCase() === old ? newHex : obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(v => replaceColorInContent(v, oldHex, newHex));
    }
    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj as Record<string, unknown>).map(([k, v]) =>
                [k, replaceColorInContent(v, oldHex, newHex)]
            )
        );
    }
    return obj;
}

// Migra el color antiguo al nuevo en todas las secciones que lo usaban
async function migrateColorInSections(oldColor: string, newColor: string): Promise<void> {
    const { data: sections } = await supabaseAdmin
        .from('page_sections').select('id, content');
    if (!sections?.length) return;

    for (const section of sections) {
        const updated = replaceColorInContent(section.content, oldColor, newColor);
        if (JSON.stringify(updated) !== JSON.stringify(section.content)) {
            await supabaseAdmin.from('page_sections')
                .update({ content: updated, updated_at: new Date().toISOString() })
                .eq('id', section.id);
        }
    }
}

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

        // Leer el color principal antiguo antes de sobreescribir
        let oldPrimaryColor: string | null = null;
        if (key === 'brand' && value?.primary_color) {
            const { data: current } = await supabaseAdmin
                .from('site_settings').select('value').eq('key', 'brand').single();
            oldPrimaryColor = (current?.value as any)?.primary_color ?? null;
        }

        const { data, error } = await supabaseAdmin
            .from('site_settings')
            .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
            .select()
            .single();

        if (error) return jsonResponse({ error: 'Error al guardar ajuste' }, 500);

        // Cascadar el nuevo color a todas las secciones que usaban el antiguo
        if (
            key === 'brand' &&
            oldPrimaryColor &&
            value.primary_color &&
            oldPrimaryColor.toLowerCase() !== value.primary_color.toLowerCase()
        ) {
            await migrateColorInSections(oldPrimaryColor, value.primary_color);
        }

        await logAdminAction(admin.id, 'update_setting', 'site_setting', key, { value }, request.headers.get('x-forwarded-for') || undefined);
        return jsonResponse({ setting: data, message: 'Ajuste guardado' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};
