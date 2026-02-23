/**
 * POST /api/cart/reserve  — Reserva stock (add to cart)
 * DELETE /api/cart/reserve — Libera stock (remove from cart)
 *
 * Verifica stock físico en products/product_variants.
 * No depende de tablas ni RPCs adicionales.
 */

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

// ── Helper: get physical stock ────────────────────────────────────────────────
async function getPhysicalStock(
    productId: string,
    variantId: string | null
): Promise<number> {
    if (variantId) {
        const { data } = await supabaseAdmin
            .from('product_variants')
            .select('stock')
            .eq('id', variantId)
            .single();
        return data?.stock ?? 0;
    }
    const { data } = await supabaseAdmin
        .from('products')
        .select('stock')
        .eq('id', productId)
        .single();
    return data?.stock ?? 0;
}

// ── POST: Añadir al carrito (verifica stock) ──────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json().catch(() => null);
        if (!body) return json({ error: 'Cuerpo inválido' }, 400);

        const { productId, variantId, quantity, sessionId } = body;

        if (!productId || !quantity || !sessionId) {
            return json({ error: 'Faltan campos obligatorios: productId, quantity, sessionId' }, 400);
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
            return json({ error: 'quantity debe ser un entero > 0' }, 400);
        }

        // Verificar stock físico
        const physicalStock = await getPhysicalStock(productId, variantId || null);

        if (physicalStock <= 0) {
            return json({ error: 'Stock insuficiente', available: 0 }, 409);
        }

        if (quantity > physicalStock) {
            return json({ error: 'Stock insuficiente', available: physicalStock }, 409);
        }

        return json({ success: true, quantity });
    } catch (err: any) {
        console.error('[reserve POST] unexpected error:', err);
        return json({ error: err.message || 'Error interno del servidor' }, 500);
    }
};

// ── DELETE: Liberar del carrito ────────────────────────────────────────────────
export const DELETE: APIRoute = async ({ request }) => {
    try {
        const body = await request.json().catch(() => null);
        if (!body) return json({ error: 'Cuerpo inválido' }, 400);

        // Nothing to release since we're not using reservation table
        return json({ success: true });
    } catch (err: any) {
        console.error('[reserve DELETE] unexpected error:', err);
        return json({ error: err.message || 'Error interno del servidor' }, 500);
    }
};
