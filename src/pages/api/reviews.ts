import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabase';

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** POST /api/reviews – Submit a product review (authenticated, verified purchase, per order_item + unit) */
export const POST: APIRoute = async ({ request, locals }) => {
    const authUser = locals.user;
    if (!authUser) return jsonResponse({ error: 'No autorizado' }, 401);

    let body: any;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Cuerpo de petición inválido' }, 400);
    }

    const { orderItemId, rating, title, comment } = body;

    if (!orderItemId || typeof rating !== 'number' || rating < 1 || rating > 5) {
        return jsonResponse({ error: 'orderItemId y rating (1–5) son obligatorios' }, 400);
    }

    // ── 1. Obtener el order_item y verificar que pertenece al usuario ──────────
    const { data: orderItem } = await supabaseAdmin
        .from('order_items')
        .select('id, quantity, product_id, order_id')
        .eq('id', orderItemId)
        .single();

    if (!orderItem) {
        return jsonResponse({ error: 'Artículo no encontrado' }, 403);
    }

    const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id, user_id, status')
        .eq('id', orderItem.order_id)
        .single();

    if (!order || order.user_id !== authUser.id) {
        return jsonResponse({ error: 'No tienes permiso para reseñar este artículo' }, 403);
    }

    // Elegible si el pedido está entregado/devuelto, o si existe una devolución aprobada
    const eligibleStatuses = ['delivered', 'partial_return', 'refunded'];
    if (!eligibleStatuses.includes(order.status)) {
        const { data: returnRecord } = await supabaseAdmin
            .from('returns')
            .select('id')
            .eq('order_id', orderItem.order_id)
            .eq('user_id', authUser.id)
            .limit(1)
            .maybeSingle();

        if (!returnRecord) {
            return jsonResponse({ error: 'No puedes reseñar este artículo todavía' }, 403);
        }
    }

    // ── 2. Contar reseñas existentes para este order_item ─────────────────────
    const { count: existingCount } = await supabaseAdmin
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', authUser.id)
        .eq('order_item_id', orderItemId);

    const reviewCount = existingCount || 0;
    if (reviewCount >= orderItem.quantity) {
        return jsonResponse({ error: 'Ya has reseñado todas las unidades de este artículo' }, 409);
    }

    // unit_index se asigna automáticamente = número de reseñas ya existentes
    const unitIndex = reviewCount;

    // ── 3. Insertar la reseña ─────────────────────────────────────────────────
    const { data, error } = await supabaseAdmin
        .from('reviews')
        .insert({
            product_id: orderItem.product_id,
            order_id: orderItem.order_id,
            order_item_id: orderItemId,
            unit_index: unitIndex,
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
