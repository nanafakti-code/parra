import type { APIRoute } from 'astro';

/**
 * POST /api/orders — DEPRECATED
 * Este endpoint usaba la tabla `carts` que ya no forma parte del flujo de compra.
 * Los pedidos se crean exclusivamente a través del webhook de Stripe (/api/stripe/webhook)
 * y el endpoint de confirmación (/api/stripe/confirm-order).
 */
export const POST: APIRoute = async () => {
    return new Response(
        JSON.stringify({ message: 'Este endpoint está obsoleto. Los pedidos se crean vía Stripe.' }),
        { status: 410, headers: { 'Content-Type': 'application/json' } },
    );
};
