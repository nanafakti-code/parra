/**
 * POST /api/stripe/create-session
 *
 * Crea una Stripe Checkout Session a partir del carrito del usuario.
 * - Parsea el body una sola vez.
 * - Valida todos los campos requeridos antes de proceder.
 * - Verifica precios y stock contra la BD (nunca confía en el frontend).
 * - No expone stack traces en las respuestas de error.
 */

import type { APIRoute } from 'astro';
import { getStripe } from '../../../lib/stripe';
import { validateStripeConfig } from '../../../lib/stripe-config-check';
import { supabase } from '../../../lib/supabase';
import { paymentLimiter } from '../../../lib/security/rateLimiter';
import { getClientIp } from '../../../lib/security/getClientIp';
import { validateCoupon } from '../../../lib/security/validateCoupon';
import { verifyTurnstile } from '../../../lib/security/verifyTurnstile';

// ── Tipos internos ─────────────────────────────────────────────────────────────

interface CartLineItem {
    id: string;
    name: string;
    image: string;
    size?: string;
    variantId?: string;
    quantity: number;
}

interface ShippingInfo {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    zip: string;
    phone: string;
}

interface SessionRequestBody {
    items: CartLineItem[];
    shippingInfo: ShippingInfo;
    email: string;
    cartSessionId?: string;
    couponCode?: string;  // Server validates — never a discount value from the client
    turnstileToken?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function jsonResponse(data: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function getOrigin(request: Request): string {
    const origin = request.headers.get('origin');
    if (origin) return origin;

    const siteUrl = import.meta.env.PUBLIC_SITE_URL;
    if (siteUrl) return siteUrl.replace(/\/$/, '');

    throw new Error(
        'No se pudo determinar el origen. ' +
        'Configura PUBLIC_SITE_URL en las variables de entorno.',
    );
}

// ── Handler ────────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const ip = getClientIp(request);
        const { success } = await paymentLimiter.limit(ip);
        if (!success) {
            return jsonResponse({ error: 'Demasiadas solicitudes. Por favor, espera unos segundos.' }, 429);
        }

        // 1. Parsear body UNA sola vez
        const body: SessionRequestBody = await request.json();
        const { items, shippingInfo, email, cartSessionId, couponCode, turnstileToken } = body;

        // ── Turnstile bot protection (verify before any business logic) ──────────
        const turnstileValid = await verifyTurnstile(turnstileToken, ip);
        if (!turnstileValid) {
            console.warn('[create-session] Turnstile verification failed. IP:', ip);
            return jsonResponse({ error: 'Bot verification failed.' }, 403);
        }

        // 2. Validaciones de entrada
        if (!Array.isArray(items) || items.length === 0) {
            return jsonResponse({ error: 'El carrito está vacío o es inválido.' }, 400);
        }

        if (!shippingInfo || !shippingInfo.firstName || !shippingInfo.address) {
            return jsonResponse({ error: 'Faltan datos de envío obligatorios.' }, 400);
        }

        if (!email) {
            return jsonResponse({ error: 'El email es obligatorio.' }, 400);
        }

        // 2b. Validate item quantities (never trust the client)
        for (const item of items) {
            const qty = Number(item.quantity);
            if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
                return jsonResponse({ error: 'Cantidad de producto inválida.' }, 400);
            }
        }

        // 3. Fetch prices and stock from DB (NEVER trust client prices)
        const productIds = items.map((item) => item.id);
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, name, price, stock')
            .in('id', productIds);

        if (productsError || !products) {
            console.error('[create-session] Error al consultar productos:', productsError);
            return jsonResponse({ error: 'Error al validar productos.' }, 500);
        }

        // 4. Build line_items using DB prices
        let subtotalEuros = 0;
        const line_items = items.map((item) => {
            const dbProduct = products.find((p) => p.id === item.id);

            if (!dbProduct) {
                throw new Error('Producto no encontrado.');
            }

            if (dbProduct.stock < item.quantity) {
                throw new Error('Stock insuficiente para uno de los productos.');
            }

            subtotalEuros += dbProduct.price * item.quantity;

            return {
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: dbProduct.name + (item.size ? ` (Talla ${item.size})` : ''),
                        images: [item.image],
                        metadata: {
                            productId: item.id,
                            variantId: item.variantId ?? '',
                            size:      item.size      ?? '',
                        },
                    },
                    unit_amount: Math.round(dbProduct.price * 100),
                },
                quantity: item.quantity,
            };
        });

        // 5. Validate coupon server-side (code only — NEVER a discount value from client)
        let stripeCouponId: string | undefined;
        let couponDbId:     string | undefined;
        let discountEuros:  number = 0;

        if (couponCode && typeof couponCode === 'string') {
            const couponResult = await validateCoupon(couponCode, subtotalEuros, (locals as any).user?.id ?? null);

            if (!couponResult.valid) {
                return jsonResponse({ error: couponResult.error }, 400);
            }

            discountEuros = couponResult.discountAmount;
            couponDbId    = couponResult.coupon.id;

            // Create a single-use Stripe coupon so the session total is set by the server
            const stripeCouponParams =
                couponResult.coupon.type === 'percentage'
                    ? { percent_off: couponResult.coupon.value }
                    : { amount_off: Math.round(discountEuros * 100), currency: 'eur' as const };

            const createdCoupon = await getStripe().coupons.create({
                ...stripeCouponParams,
                duration:         'once',
                max_redemptions:  1,
                name:             `Desc. ${couponResult.coupon.code}`,
                metadata:         { db_coupon_id: couponDbId },
            });
            stripeCouponId = createdCoupon.id;
        }

        // 6. Determine origin for return URLs
        const origin = getOrigin(request);

        // 7. Validate Stripe config
        validateStripeConfig();

        // 8. Create Stripe Checkout Session
        const session = await getStripe().checkout.sessions.create({
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            customer_email: email,
            success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${origin}/cancel`,
            // Apply server-validated coupon as a Stripe discount (1-use only)
            ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
            metadata: {
                shipping_name:    `${shippingInfo.firstName} ${shippingInfo.lastName}`,
                shipping_address: shippingInfo.address,
                shipping_city:    shippingInfo.city,
                shipping_zip:     shippingInfo.zip,
                shipping_phone:   shippingInfo.phone,
                cartSessionId:    cartSessionId ?? '',
                // Coupon data for order creation in webhook/confirm-order
                coupon_id:        couponDbId    ?? '',
                discount_amount:  discountEuros.toFixed(2),
            },
        });

        console.log('[create-session] Session created:', session.id);

        return jsonResponse({ url: session.url }, 200);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error interno del servidor';
        console.error('[create-session] Error:', message);
        return jsonResponse({ error: message }, 500);
    }
};
