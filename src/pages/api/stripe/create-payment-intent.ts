import type { APIRoute } from 'astro';
import { getStripe } from '../../../lib/stripe';
import { supabase } from '../../../lib/supabase';
import { paymentLimiter } from '../../../lib/security/rateLimiter';
import { getClientIp } from '../../../lib/security/getClientIp';
import { validateCoupon } from '../../../lib/security/validateCoupon';
import { verifyTurnstile } from '../../../lib/security/verifyTurnstile';

function jsonResponse(data: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const ip = getClientIp(request);
        const { success } = await paymentLimiter.limit(ip);
        if (!success) {
            return jsonResponse({ error: 'Demasiadas solicitudes. Por favor, espera unos segundos.' }, 429);
        }

        const body = await request.json();
        // Accept couponCode (string only — NEVER a discount value from the client)
        const { items, shippingInfo, email, couponCode, turnstileToken } = body;

        // ── Turnstile bot protection (verify before any business logic) ──────────
        const turnstileValid = await verifyTurnstile(turnstileToken, ip);
        if (!turnstileValid) {
            console.warn('[create-payment-intent] Turnstile verification failed. IP:', ip);
            return jsonResponse({ error: 'Bot verification failed.' }, 403);
        }

        if (!Array.isArray(items) || items.length === 0) {
            return jsonResponse({ error: 'El carrito está vacío.' }, 400);
        }

        // ── 1. Validate quantities before hitting the DB ──────────────────────────
        for (const item of items) {
            const qty = Number(item.quantity);
            if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
                return jsonResponse({ error: 'Cantidad de producto inválida.' }, 400);
            }
        }

        // ── 2. Fetch prices and stock from DB (NEVER trust client prices) ─────────
        const productIds = items.map((item) => item.id);
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, price, stock')
            .in('id', productIds);

        if (productsError || !products) {
            return jsonResponse({ error: 'Error al validar productos.' }, 500);
        }

        let subtotalCents = 0;
        for (const item of items) {
            const dbProduct = products.find((p) => p.id === item.id);
            if (!dbProduct) {
                return jsonResponse({ error: 'Producto no encontrado.' }, 400);
            }
            if (dbProduct.stock < item.quantity) {
                return jsonResponse({ error: 'Stock insuficiente para uno de los productos.' }, 400);
            }
            subtotalCents += Math.round(dbProduct.price * 100) * item.quantity;
        }

        // ── 3. Validate coupon server-side (code only, no client-supplied discounts) ─
        let couponId: string | null = null;
        let discountCents = 0;

        if (couponCode && typeof couponCode === 'string') {
            const subtotalEuros = subtotalCents / 100;
            const couponResult = await validateCoupon(couponCode, subtotalEuros);

            if (!couponResult.valid) {
                return jsonResponse({ error: couponResult.error }, 400);
            }

            couponId    = couponResult.coupon.id;
            discountCents = Math.round(couponResult.discountAmount * 100);
        }

        const amountTotal = Math.max(50, subtotalCents - discountCents); // Stripe min: 50¢

        // ── 4. Create PaymentIntent with server-computed amount ───────────────────
        const paymentIntent = await getStripe().paymentIntents.create({
            amount: amountTotal,
            currency: 'eur',
            payment_method_types: ['card'],
            capture_method: 'manual',
            metadata: {
                shipping_name:    shippingInfo?.firstName ? `${shippingInfo.firstName} ${shippingInfo.lastName || ''}` : '',
                shipping_address: shippingInfo?.address ?? '',
                shipping_city:    shippingInfo?.city    ?? '',
                shipping_zip:     shippingInfo?.zip     ?? '',
                shipping_phone:   shippingInfo?.phone   ?? '',
                email:            email ?? '',
                // Coupon data stored server-side in Stripe metadata — never from client
                coupon_id:        couponId ?? '',
                discount_amount:  (discountCents / 100).toFixed(2),
            },
        });

        return jsonResponse({ clientSecret: paymentIntent.client_secret }, 200);
    } catch (error: unknown) {
        console.error('[create-payment-intent]', error);
        return jsonResponse({ error: 'Error interno del servidor.' }, 500);
    }
};
