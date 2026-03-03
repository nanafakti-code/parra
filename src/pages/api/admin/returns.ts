import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse, logAdminAction } from '../../../lib/admin';

/** GET /api/admin/returns?status=...&page=1 */
export const GET: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
        .from('returns')
        .select('*, orders(id, total, status), users(name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
        query = query.eq('status', status);
    }

    const { data, count, error } = await query;
    if (error) return jsonResponse({ error: 'Error al obtener devoluciones' }, 500);

    return jsonResponse({ returns: data || [], total: count || 0, page, totalPages: Math.ceil((count || 0) / limit) });
};

/** PATCH /api/admin/returns – Update return status */
export const PATCH: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { returnId, status, adminNotes, refundAmount } = body;

        if (!returnId || !status) return jsonResponse({ error: 'returnId y status obligatorios' }, 400);

        const validStatuses = ['pending', 'approved', 'rejected', 'refunded'];
        if (!validStatuses.includes(status)) return jsonResponse({ error: 'Estado inválido' }, 400);

        const updateData: Record<string, any> = { status, updated_at: new Date().toISOString() };
        if (adminNotes !== undefined) updateData.admin_notes = adminNotes;
        if (refundAmount !== undefined) updateData.refund_amount = refundAmount;

        const { data, error } = await supabaseAdmin
            .from('returns')
            .update(updateData)
            .eq('id', returnId)
            .select()
            .single();

        if (error) return jsonResponse({ error: 'Error al actualizar devolución' }, 500);

        await logAdminAction(admin.id, 'update_return', 'return', returnId, { newStatus: status, refundAmount }, request.headers.get('x-forwarded-for'));

        return jsonResponse({ return: data, message: 'Devolución actualizada' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};
