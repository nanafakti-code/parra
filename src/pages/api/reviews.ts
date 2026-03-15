import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabase';

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** POST /api/reviews – Submit a product review (authenticated, verified purchase) */
export const POST: APIRoute = async ({ request, locals }) => {
    const authUser = locals.user;
    if (!authUser) return jsonResponse({ error: 'No autorizado' }, 401);

    let body: any;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Cuerpo de petición inválido' }, 400);
    }

    const { productId, rating, title, comment } = body;

    if (!productId || typeof rating !== 'number' || rating < 1 || rating > 5) {
        return jsonResponse({ error: 'productId y rating (1–5) son obligatorios' }, 400);
    }

    // ── 1. Verify user has a delivered order OR a return containing this product ──
    const [{ data: deliveredOrders }, { data: userReturns }] = await Promise.all([
        supabaseAdmin
            .from('orders')
            .select('id')
            .eq('user_id', authUser.id)
            .eq('status', 'delivered'),
        supabaseAdmin
            .from('returns')
            .select('order_id')
            .eq('user_id', authUser.id),
    ]);

    const eligibleOrderIds = [
        ...new Set([
            ...(deliveredOrders || []).map((o: any) => o.id),
            ...(userReturns || []).map((r: any) => r.order_id),
        ]),
    ];

    if (eligibleOrderIds.length === 0) {
        return jsonResponse({ error: 'No tienes ningún pedido elegible para reseñar' }, 403);
    }

    const { data: eligibleItem } = await supabaseAdmin
        .from('order_items')
        .select('id')
        .eq('product_id', productId)
        .in('order_id', eligibleOrderIds)
        .limit(1)
        .maybeSingle();

    if (!eligibleItem) {
        return jsonResponse({ error: 'No has comprado este producto en un pedido entregado' }, 403);
    }

    // ── 2. Prevent duplicate reviews ──────────────────────────────────────────
    const { data: existingReview } = await supabaseAdmin
        .from('reviews')
        .select('id')
        .eq('user_id', authUser.id)
        .eq('product_id', productId)
        .maybeSingle();

    if (existingReview) {
        return jsonResponse({ error: 'Ya has reseñado este producto' }, 409);
    }

    // ── 3. Insert review ───────────────────────────────────────────────────────
    const { data, error } = await supabaseAdmin
        .from('reviews')
        .insert({
            product_id: productId,
            user_id: authUser.id,
            rating: Math.round(rating),
            title: title?.trim() || null,
            comment: comment?.trim() || null,
            is_verified: true,
            is_approved: false,
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving review:', error);
        return jsonResponse({ error: 'Error al guardar la reseña' }, 500);
    }

    return jsonResponse({ review: data, message: 'Reseña enviada. Está pendiente de aprobación.' }, 201);
};
