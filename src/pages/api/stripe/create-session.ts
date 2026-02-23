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

export const POST: APIRoute = async ({ request }) => {
    try {
        // 1. Parsear body UNA sola vez
        const body: SessionRequestBody = await request.json();
        const { items, shippingInfo, email, cartSessionId } = body;

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

        // 3. Validar productos y precios contra la BD
        const productIds = items.map((item) => item.id);
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, name, price, stock')
            .in('id', productIds);

        if (productsError || !products) {
            console.error('[create-session] Error al consultar productos:', productsError);
            return jsonResponse({ error: 'Error al validar productos.' }, 500);
        }

        // 4. Construir line_items para Stripe
        const line_items = items.map((item) => {
            const dbProduct = products.find((p) => p.id === item.id);

            if (!dbProduct) {
                throw new Error(`Producto no encontrado: ${item.id}`);
            }

            if (dbProduct.stock < item.quantity) {
                throw new Error(`Stock insuficiente para "${dbProduct.name}".`);
            }

            return {
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: dbProduct.name + (item.size ? ` (Talla ${item.size})` : ''),
                        images: [item.image],
                        metadata: {
                            productId: item.id,
                            variantId: item.variantId ?? '',
                            size: item.size ?? '',
                        },
                    },
                    unit_amount: Math.round(dbProduct.price * 100), // Stripe usa céntimos
                },
                quantity: item.quantity,
            };
        });

        // 5. Determinar origin para URLs de retorno
        const origin = getOrigin(request);

        // 6. Log pre-creación
        console.log('[create-session] Creating Stripe session with:', {
            itemsCount: items.length,
            email,
            origin,
        });

        // 7. Validar configuración de Stripe
        validateStripeConfig();

        // 8. Crear sesión de Stripe Checkout
        const session = await getStripe().checkout.sessions.create({
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            customer_email: email,
            success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/cancel`,
            metadata: {
                shipping_name: `${shippingInfo.firstName} ${shippingInfo.lastName}`,
                shipping_address: shippingInfo.address,
                shipping_city: shippingInfo.city,
                shipping_zip: shippingInfo.zip,
                shipping_phone: shippingInfo.phone,
                cartSessionId: cartSessionId ?? '',
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
