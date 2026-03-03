import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse, logAdminAction } from '../../../lib/admin';

/** GET /api/admin/reviews?approved=...&page=1 */
export const GET: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;

    const url = new URL(request.url);
    const approved = url.searchParams.get('approved');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
        .from('reviews')
        .select('*, products(name, slug), users(name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (approved === 'true') query = query.eq('is_approved', true);
    if (approved === 'false') query = query.eq('is_approved', false);

    const { data, count, error } = await query;
    if (error) return jsonResponse({ error: 'Error al obtener reseñas' }, 500);

    return jsonResponse({ reviews: data || [], total: count || 0, page, totalPages: Math.ceil((count || 0) / limit) });
};

/** PATCH /api/admin/reviews – Approve/reject/update */
export const PATCH: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { reviewId, isApproved } = body;

        if (!reviewId || isApproved === undefined) {
            return jsonResponse({ error: 'reviewId y isApproved obligatorios' }, 400);
        }

        const { data, error } = await supabaseAdmin
            .from('reviews')
            .update({ is_approved: isApproved })
            .eq('id', reviewId)
            .select()
            .single();

        if (error) return jsonResponse({ error: 'Error al actualizar reseña' }, 500);

        await logAdminAction(admin.id, isApproved ? 'approve_review' : 'reject_review', 'review', reviewId, {}, request.headers.get('x-forwarded-for'));
        return jsonResponse({ review: data, message: isApproved ? 'Reseña aprobada' : 'Reseña rechazada' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};

/** DELETE /api/admin/reviews?id=... */
export const DELETE: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    const url = new URL(request.url);
    const reviewId = url.searchParams.get('id');
    if (!reviewId) return jsonResponse({ error: 'id obligatorio' }, 400);

    const { error } = await supabaseAdmin.from('reviews').delete().eq('id', reviewId);
    if (error) return jsonResponse({ error: 'Error al eliminar reseña' }, 500);

    await logAdminAction(admin.id, 'delete_review', 'review', reviewId, {}, request.headers.get('x-forwarded-for'));
    return jsonResponse({ message: 'Reseña eliminada' });
};
