/**
 * POST /api/stripe/webhook
 *
 * Webhook de Stripe — procesa eventos de pago completado.
 *
 * Fixes applied (Launch-Readiness Audit — Blocker 1):
 *   - The old SELECT → INSERT idempotency check was not atomic.
 *     A Stripe retry arriving before the first INSERT committed
 *     could pass the check and create a duplicate order.
 *   - Order + order_items were separate calls with no transaction.
 *     A crash mid-loop left orphan orders with missing items.
 *
 * Delegates to create_order_from_webhook() RPC which:
 *   • Runs order INSERT + all order_items INSERTs + stock decrements
 *     inside a single PostgreSQL transaction.
 *   • Catches unique_violation (23505) at DB level so a concurrent
 *     Stripe retry is handled gracefully instead of creating a dupe.
 */

import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { getStripe } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabase';
import { generateInvoicePdf } from '../../../lib/pdf';
import { sendOrderConfirmationEmail } from '../../../lib/email/index';

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

// ── Types ──────────────────────────────────────────────────────────────────────

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

/** Shape of each element in the p_items JSONB array expected by the RPC. */
interface WebhookOrderItem {
    product_id:    string;
    variant_id:    string;   // empty string when no variant (RPC treats '' as NULL)
    product_name:  string;
    product_image: string | null;
    size:          string | null;
    quantity:      number;
    unit_price:    number;
    total_price:   number;
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
        // 5. Retrieve expanded line items from Stripe
        const fullSession = await getStripe().checkout.sessions.retrieve(
            stripeSessionId,
            { expand: ['line_items.data.price.product'] },
        );

        const lineItems = (fullSession.line_items?.data ?? []) as unknown as ExpandedLineItem[];

        if (lineItems.length === 0) {
            console.error(`[webhook] Sin line items para session ${stripeSessionId}`);
            return jsonResponse({ error: 'No line items found' }, 500);
        }

        // 6. Resolve email (required to create the order)
        const metadata = session.metadata ?? {};
        const email =
            session.customer_details?.email ??
            session.customer_email ??
            metadata.email ??
            '';

        if (!email) {
            console.error(`[webhook] Email no encontrado para session ${stripeSessionId}`);
            return jsonResponse({ error: 'Email is required to create order' }, 400);
        }

        const amountTotal = session.amount_total ? session.amount_total / 100 : 0;

        // 7. Resolve Stripe charge ID (needed for future refunds)
        let stripeChargeId = '';
        if (session.payment_intent) {
            try {
                const pi = await getStripe().paymentIntents.retrieve(
                    session.payment_intent as string,
                    { expand: ['latest_charge'] },
                );
                const charge = pi.latest_charge;
                if (charge) {
                    stripeChargeId = typeof charge === 'string' ? charge : charge.id;
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'unknown';
                console.warn(`[webhook] No se pudo obtener charge ID: ${msg}`);
            }
        }

        // 8. Resolve user account for this email (null = guest checkout)
        const { data: userRow } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        const userId: string | null = userRow?.id ?? null;

        // 9. Build the structured items array for the RPC.
        //    All monetary values are converted from Stripe cents → euros here.
        const items: WebhookOrderItem[] = lineItems.flatMap((item) => {
            const product = item.price?.product;
            if (!product) return [];
            const unitPrice = item.price?.unit_amount ? item.price.unit_amount / 100 : 0;
            const qty       = item.quantity ?? 1;
            return [{
                product_id:    product.metadata?.productId    ?? '',
                variant_id:    product.metadata?.variantId    ?? '',
                size:          product.metadata?.size         ?? null,
                product_name:  product.name,
                product_image: product.images?.[0]            ?? null,
                quantity:      qty,
                unit_price:    unitPrice,
                total_price:   unitPrice * qty,
            }];
        });

        // 10. ── ATOMIC ORDER CREATION ────────────────────────────────────────
        //     One RPC call = one PostgreSQL transaction.
        //     • Inserts the order row.
        //     • Inserts ALL order_items in the same transaction.
        //     • Decrements stock atomically for each item.
        //     • If a Stripe retry races past the SELECT check inside the RPC,
        //       the UNIQUE constraint on stripe_session_id fires and the
        //       EXCEPTION handler returns already_exists=true instead of a 500.
        const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
            'create_order_from_webhook',
            {
                p_stripe_session_id: stripeSessionId,
                p_stripe_charge_id:  stripeChargeId,
                p_user_id:           userId,
                p_email:             email,
                p_amount_total:      amountTotal,
                p_shipping_name:     metadata.shipping_name    ?? null,
                p_shipping_street:   metadata.shipping_address ?? null,
                p_shipping_city:     metadata.shipping_city    ?? null,
                p_shipping_postal:   metadata.shipping_zip     ?? null,
                p_shipping_phone:    metadata.shipping_phone   ?? null,
                p_items:             items,
            },
        );

        if (rpcError) {
            console.error('[webhook] Error en RPC create_order_from_webhook:', rpcError.message);
            return jsonResponse({ error: 'Failed to create order' }, 500);
        }

        // Already processed by a previous or concurrent webhook delivery
        if (rpcResult?.already_exists) {
            console.log(`[webhook] Orden ya existente para session ${stripeSessionId}, ignorando.`);
            return jsonResponse({ received: true, already_processed: true }, 200);
        }

        const orderId: string = rpcResult?.order_id;
        if (!orderId) {
            console.error('[webhook] RPC no devolvió order_id.');
            return jsonResponse({ error: 'Order creation returned no ID' }, 500);
        }

        if (rpcResult?.stock_issue) {
            console.error(`[webhook] Orden ${orderId} tiene STOCK_ISSUE — revisar inventario.`);
        }

        console.log(`[webhook] Orden ${orderId} creada. Generando email de confirmación...`);

        // 11. Send confirmation email + PDF invoice.
        //     Runs AFTER the order is safely persisted in a committed transaction.
        //     A failure here does NOT roll back the order (payment already captured).
        //     The /success page has a fallback: it calls /api/stripe/confirm-order
        //     which retries when email_sent=false.
        try {
            const { data: fullOrder } = await supabaseAdmin
                .from('orders')
                .select('*, order_items(*), coupons(code)')
                .eq('id', orderId)
                .single();

            if (fullOrder) {
                const pdfBuffer = await generateInvoicePdf(fullOrder);
                const emailSent = await sendOrderConfirmationEmail(
                    fullOrder,
                    fullOrder.order_items ?? [],
                    pdfBuffer,
                );

                if (emailSent) {
                    await supabaseAdmin
                        .from('orders')
                        .update({ email_sent: true })
                        .eq('id', orderId);
                    console.log(`[webhook] Email enviado para orden ${orderId}.`);
                } else {
                    console.warn(`[webhook] Email no enviado para orden ${orderId}. Se reintentará desde /success.`);
                }
            }
        } catch (emailErr: unknown) {
            const msg = emailErr instanceof Error ? emailErr.message : 'Error desconocido';
            console.error(`[webhook] Error en email/PDF (orden ${orderId}):`, msg);
            // Order is already created and payment captured — do not rethrow.
        }

        return jsonResponse({ received: true, order_id: orderId }, 200);

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error interno';
        console.error('[webhook] Error procesando evento:', msg);
        return jsonResponse({ error: 'Error processing order' }, 500);
    }
};
