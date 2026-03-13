import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse, logAdminAction } from '../../../lib/admin';

// Sanitize HTML to prevent XSS
function sanitize(val: unknown): unknown {
    if (typeof val === 'string') {
        return val.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .replace(/javascript:/gi, '');
    }
    if (Array.isArray(val)) return val.map(sanitize);
    if (val && typeof val === 'object') {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            clean[k] = sanitize(v);
        }
        return clean;
    }
    return val;
}

/** GET /api/admin/editor/sections?page=home */
export const GET: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;

    const url = new URL(request.url);
    const pageName = url.searchParams.get('page');

    if (pageName) {
        const { data, error } = await supabaseAdmin
            .from('page_sections')
            .select('*')
            .eq('page_name', pageName)
            .order('display_order', { ascending: true });
        if (error) return jsonResponse({ error: 'Error al obtener secciones' }, 500);
        return jsonResponse({ sections: data || [] });
    }

    // List all pages with section counts
    const { data, error } = await supabaseAdmin
        .from('page_sections')
        .select('*')
        .order('page_name')
        .order('display_order', { ascending: true });
    if (error) return jsonResponse({ error: 'Error al obtener secciones' }, 500);

    // Group by page
    const pages: Record<string, any[]> = {};
    (data || []).forEach(s => {
        if (!pages[s.page_name]) pages[s.page_name] = [];
        pages[s.page_name].push(s);
    });

    return jsonResponse({ pages });
};

/** PATCH /api/admin/editor/sections – Update a section */
export const PATCH: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { id, content, is_active, display_order, label } = body;

        if (!id) return jsonResponse({ error: 'id obligatorio' }, 400);

        // Get current section for history
        const { data: current } = await supabaseAdmin
            .from('page_sections')
            .select('*')
            .eq('id', id)
            .single();

        if (!current) return jsonResponse({ error: 'Sección no encontrada' }, 404);

        // Save history before updating
        await supabaseAdmin.from('section_history').insert({
            section_id: current.id,
            page_name: current.page_name,
            section_key: current.section_key,
            content: current.content,
            changed_by: admin.id,
        });

        // Build update object
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (content !== undefined) update.content = sanitize(content);
        if (is_active !== undefined) update.is_active = !!is_active;
        if (display_order !== undefined) update.display_order = display_order;
        if (label !== undefined) update.label = sanitize(label) as string;

        const { data, error } = await supabaseAdmin
            .from('page_sections')
            .update(update)
            .eq('id', id)
            .select()
            .single();

        if (error) return jsonResponse({ error: 'Error al actualizar sección' }, 500);

        await logAdminAction(admin.id, 'update_section', 'page_sections', id,
            { page_name: current.page_name, section_key: current.section_key },
            request.headers.get('x-forwarded-for') || undefined);

        return jsonResponse({ section: data, message: 'Sección actualizada' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};

/** POST /api/admin/editor/sections – Bulk reorder or duplicate */
export const POST: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { action } = body;

        // ── Reorder ──
        if (action === 'reorder') {
            const { orders } = body; // [{ id, display_order }]
            if (!Array.isArray(orders)) return jsonResponse({ error: 'orders es requerido' }, 400);

            for (const item of orders) {
                await supabaseAdmin
                    .from('page_sections')
                    .update({ display_order: item.display_order, updated_at: new Date().toISOString() })
                    .eq('id', item.id);
            }

            await logAdminAction(admin.id, 'reorder_sections', 'page_sections', undefined,
                { orders }, request.headers.get('x-forwarded-for') || undefined);

            return jsonResponse({ message: 'Orden actualizado' });
        }

        // ── Duplicate ──
        if (action === 'duplicate') {
            const { id } = body;
            const { data: original } = await supabaseAdmin
                .from('page_sections')
                .select('*')
                .eq('id', id)
                .single();

            if (!original) return jsonResponse({ error: 'Sección no encontrada' }, 404);

            const { data: newSection, error } = await supabaseAdmin
                .from('page_sections')
                .insert({
                    page_name: original.page_name,
                    section_key: original.section_key + '_copy_' + Date.now(),
                    label: original.label + ' (copia)',
                    content: original.content,
                    display_order: original.display_order + 1,
                    is_active: false,
                })
                .select()
                .single();

            if (error) return jsonResponse({ error: 'Error al duplicar' }, 500);
            return jsonResponse({ section: newSection, message: 'Sección duplicada' });
        }

        // ── Reset to default ──
        if (action === 'reset') {
            const { id } = body;
            const { data: history } = await supabaseAdmin
                .from('section_history')
                .select('content')
                .eq('section_id', id)
                .order('changed_at', { ascending: true })
                .limit(1);

            if (history && history.length > 0) {
                await supabaseAdmin
                    .from('page_sections')
                    .update({ content: history[0].content, updated_at: new Date().toISOString() })
                    .eq('id', id);
                return jsonResponse({ message: 'Sección reseteada al estado original' });
            }
            return jsonResponse({ error: 'Sin historial disponible' }, 404);
        }

        // ── Get history ──
        if (action === 'history') {
            const { id } = body;
            const { data } = await supabaseAdmin
                .from('section_history')
                .select('*')
                .eq('section_id', id)
                .order('changed_at', { ascending: false })
                .limit(20);
            return jsonResponse({ history: data || [] });
        }

        // ── Create new section ──
        if (action === 'create') {
            const { page_name, section_key, label, content } = body;
            if (!page_name || !section_key || !label) {
                return jsonResponse({ error: 'page_name, section_key y label son obligatorios' }, 400);
            }

            // Get max display_order for this page
            const { data: existing } = await supabaseAdmin
                .from('page_sections')
                .select('display_order')
                .eq('page_name', page_name)
                .order('display_order', { ascending: false })
                .limit(1);

            const nextOrder = (existing && existing.length > 0) ? existing[0].display_order + 1 : 0;

            const { data: newSection, error } = await supabaseAdmin
                .from('page_sections')
                .insert({
                    page_name,
                    section_key: section_key.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                    label,
                    content: content || {},
                    display_order: nextOrder,
                    is_active: false,
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') return jsonResponse({ error: 'Ya existe una sección con esa clave' }, 409);
                return jsonResponse({ error: 'Error al crear sección' }, 500);
            }

            await logAdminAction(admin.id, 'create_section', 'page_sections', newSection.id,
                { page_name, section_key }, request.headers.get('x-forwarded-for') || undefined);

            return jsonResponse({ section: newSection, message: 'Sección creada' }, 201);
        }

        // ── Delete (method override for proxies that block DELETE) ──
        if (action === 'delete') {
            const { id } = body;
            if (!id) return jsonResponse({ error: 'id requerido' }, 400);

            // Delete history records first to avoid foreign key constraint violations
            await supabaseAdmin.from('section_history').delete().eq('section_id', id);

            const { error } = await supabaseAdmin
                .from('page_sections')
                .delete()
                .eq('id', id);

            if (error) return jsonResponse({ error: 'Error al eliminar sección' }, 500);

            await logAdminAction(admin.id, 'delete_section', 'page_sections', id,
                {}, request.headers.get('x-forwarded-for') || undefined);

            return jsonResponse({ message: 'Sección eliminada' });
        }

        return jsonResponse({ error: 'Acción no reconocida' }, 400);
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};

/** DELETE /api/admin/editor/sections?id=xxx – Delete a section */
export const DELETE: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'id requerido' }, 400);

    // Delete history records first to avoid foreign key constraint violations
    await supabaseAdmin.from('section_history').delete().eq('section_id', id);

    const { error } = await supabaseAdmin
        .from('page_sections')
        .delete()
        .eq('id', id);

    if (error) return jsonResponse({ error: 'Error al eliminar sección' }, 500);

    await logAdminAction(admin.id, 'delete_section', 'page_sections', id,
        {}, request.headers.get('x-forwarded-for') || undefined);

    return jsonResponse({ message: 'Sección eliminada' });
};
