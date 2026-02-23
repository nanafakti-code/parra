/**
 * POST /api/stripe/webhook
 *
 * Webhook de Stripe — procesa eventos de pago completado.
 *
 * - Valida firma con constructEvent (raw body).
 * - Idempotente: no reprocesa si ya existe la orden para esa session.
 * - Crea la orden con los campos correctos del schema.
 * - Crea order_items con snapshots de nombre, imagen, precio.
 * - Decrementa stock de forma atómica (sin race conditions).
 * - No expone stack traces.
 * - No usa process.env.
 */

import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { getStripe } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabase';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getWebhookSecret(): string {
    const secret = import.meta.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        throw new Error('[webhook] STRIPE_WEBHOOK_SECRET no está configurada.');
    }
    return secret;
}

function jsonResponse(data: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ── Tipos para line items expandidos ───────────────────────────────────────────

interface ExpandedProduct {
    name: string;
    images: string[];
    metadata: Record<string, string>;
}

interface ExpandedLineItem {
    quantity: number | null;
    price: {
        unit_amount: number | null;
        product: ExpandedProduct;
    } | null;
}

/**
 * Decrementa stock de una variante usando RPC atómica de PostgreSQL.
 * La función SQL hace UPDATE ... WHERE stock >= quantity en una sola operación.
 */
async function decrementVariantStock(variantId: string, quantity: number): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc('decrement_variant_stock_atomic', {
        variant_id: variantId,
        quantity: quantity,
    });

    if (error) {
        console.warn(`[webhook] Error decrementando stock variante ${variantId}:`, error.message);
        return false;
    }

    return data === true;
}

/**
 * Decrementa stock del producto principal usando RPC atómica de PostgreSQL.
 */
async function decrementProductStock(productId: string, quantity: number): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc('decrement_product_stock_atomic', {
        product_id: productId,
        quantity: quantity,
    });

    if (error) {
        console.warn(`[webhook] Error decrementando stock producto ${productId}:`, error.message);
        return false;
    }

    return data === true;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
    // 1. Obtener firma
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
        console.error('[webhook] Falta la cabecera stripe-signature.');
        return jsonResponse({ error: 'Missing stripe-signature header' }, 400);
    }

    // 2. Obtener webhook secret
    let webhookSecret: string;
    try {
        webhookSecret = getWebhookSecret();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Config error';
        console.error('[webhook]', msg);
        return jsonResponse({ error: 'Webhook not configured' }, 500);
    }

    // 3. Validar firma con raw body
    const rawBody = await request.text();
    let event: Stripe.Event;

    try {
        event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Signature verification failed';
        console.error('[webhook] Firma inválida:', msg);
        return jsonResponse({ error: 'Invalid signature' }, 400);
    }

    // 4. Solo procesar checkout.session.completed
    if (event.type !== 'checkout.session.completed') {
        console.log(`[webhook] Evento ignorado: ${event.type}`);
        return jsonResponse({ received: true }, 200);
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const stripeSessionId = session.id;

    console.log(`[webhook] Procesando checkout.session.completed: ${stripeSessionId}`);

    try {
        // 5. Idempotencia: verificar si ya existe una orden con este stripe_session_id
        const { data: existingOrder } = await supabaseAdmin
            .from('orders')
            .select('id')
            .eq('stripe_session_id', stripeSessionId)
            .maybeSingle();

        if (existingOrder) {
            console.log(`[webhook] Orden ya existe para session ${stripeSessionId}, ignorando.`);
            return jsonResponse({ received: true, already_processed: true }, 200);
        }

        // 6. Recuperar line items expandidos desde Stripe
        const fullSession = await getStripe().checkout.sessions.retrieve(stripeSessionId, {
            expand: ['line_items.data.price.product'],
        });

        const lineItems = (fullSession.line_items?.data ?? []) as unknown as ExpandedLineItem[];

        if (lineItems.length === 0) {
            console.error(`[webhook] No se encontraron line items para session ${stripeSessionId}`);
            return jsonResponse({ error: 'No line items found' }, 500);
        }

        // 7. Extraer datos
        const metadata = session.metadata ?? {};
        const email = session.customer_details?.email ?? metadata.email ?? '';
        const amountTotal = session.amount_total ? session.amount_total / 100 : 0;

        // 8. Buscar usuario por email (puede no existir si es invitado)
        let userId: string | null = null;
        if (email) {
            const { data: user } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('email', email)
                .maybeSingle();

            userId = user?.id ?? null;
        }

        // 9. Crear orden en Supabase
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .insert({
                user_id: userId,
                email: email,
                stripe_session_id: stripeSessionId,
                status: 'pending',
                subtotal: amountTotal,
                total: amountTotal,
                shipping_name: metadata.shipping_name ?? null,
                shipping_street: metadata.shipping_address ?? null,
                shipping_city: metadata.shipping_city ?? null,
                shipping_postal_code: metadata.shipping_zip ?? null,
                shipping_phone: metadata.shipping_phone ?? null,
            })
            .select('id')
            .single();

        if (orderError || !order) {
            console.error('[webhook] Error al crear orden:', orderError?.message);
            return jsonResponse({ error: 'Failed to create order' }, 500);
        }

        console.log(`[webhook] Orden creada: ${order.id}`);

        // 10. Crear order_items y decrementar stock atómicamente
        for (const item of lineItems) {
            const product = item.price?.product;
            if (!product) continue;

            const productId = product.metadata?.productId;
            const variantId = product.metadata?.variantId || null;
            const size = product.metadata?.size || null;
            const quantity = item.quantity ?? 1;
            const unitPrice = item.price?.unit_amount ? item.price.unit_amount / 100 : 0;
            const productImage = product.images?.[0] ?? null;

            // 10a. Insertar order_item con todos los campos requeridos
            const { error: itemError } = await supabaseAdmin
                .from('order_items')
                .insert({
                    order_id: order.id,
                    product_id: productId,
                    variant_id: variantId,
                    product_name: product.name,
                    product_image: productImage,
                    size: size,
                    quantity: quantity,
                    unit_price: unitPrice,
                    total_price: unitPrice * quantity,
                });

            if (itemError) {
                console.error(`[webhook] Error al insertar order_item: ${itemError.message}`);
            }

            // 10b. Decrementar stock atómicamente
            if (productId) {
                let decremented: boolean;

                if (variantId) {
                    decremented = await decrementVariantStock(variantId, quantity);
                } else {
                    decremented = await decrementProductStock(productId, quantity);
                }

                if (!decremented) {
                    console.warn(
                        `[webhook] Stock insuficiente para ${variantId ? `variante ${variantId}` : `producto ${productId}`}` +
                        ` (cantidad solicitada: ${quantity})`,
                    );
                }
            }
        }

        console.log(`[webhook] Orden ${order.id} procesada con éxito.`);
        return jsonResponse({ received: true, order_id: order.id }, 200);

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error interno';
        console.error('[webhook] Error procesando orden:', msg);
        return jsonResponse({ error: 'Error processing order' }, 500);
    }
};
