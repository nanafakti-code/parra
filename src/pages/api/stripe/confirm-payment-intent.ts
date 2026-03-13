import type { APIRoute } from 'astro';
import { getStripe } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabase';
import { generateInvoicePdf } from '../../../lib/pdf';
import { sendOrderConfirmationEmail } from '../../../lib/email/index';
import { evaluateFraudSignals, logFraudAttempt } from '../../../lib/security/fraudDetection';
import { getClientIp } from '../../../lib/security/getClientIp';

function jsonResponse(data: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const POST: APIRoute = async ({ request }) => {
    const ipAddress = getClientIp(request);
    try {
        const body = await request.json();
        const { paymentIntentId, items, shippingInfo, email } = body;

        if (!paymentIntentId) {
            return jsonResponse({ error: 'Falta paymentIntentId' }, 400);
        }

        // ── 1. Validate item quantities (never trust the client) ───────────────────
        if (!Array.isArray(items) || items.length === 0) {
            return jsonResponse({ error: 'El carrito está vacío.' }, 400);
        }
        for (const item of items) {
            const qty = Number(item.quantity);
            if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
                return jsonResponse({ error: 'Cantidad de producto inválida.' }, 400);
            }
        }

        // ── 2. Retrieve PaymentIntent from Stripe — expand latest_charge for fraud signals ─
        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.retrieve(
            paymentIntentId,
            { expand: ['latest_charge'] },
        );

        // Validate status: only 'requires_capture' (manual) or 'succeeded' are acceptable
        const validStatuses = ['requires_capture', 'succeeded'];
        if (!validStatuses.includes(paymentIntent.status)) {
            return jsonResponse({ error: `Estado de pago inválido: ${paymentIntent.status}` }, 400);
        }

        // ── 3. Duplicate order protection (idempotency) ─────────────────────────
        const { data: existingOrder } = await supabaseAdmin
            .from('orders')
            .select('id')
            .eq('stripe_payment_intent_id', paymentIntentId)
            .maybeSingle();

        if (existingOrder) {
            // Order was already created (e.g. via a previous retry) — capture only
            await stripe.paymentIntents.capture(paymentIntentId).catch(() => null);
            return jsonResponse({ ok: true, order_id: existingOrder.id, already_exists: true }, 200);
        }

        // ── 4. Extract coupon data from PaymentIntent metadata (set server-side) ───
        const piMetadata = paymentIntent.metadata ?? {};
        const couponId       = piMetadata.coupon_id || null;
        const discountAmount = parseFloat(piMetadata.discount_amount ?? '0') || 0;
        const shippingCost   = parseFloat(piMetadata.shipping_cost   ?? '0') || 0;

        // ── 4b. Fraud signals evaluation ──────────────────────────────────────
        const fraud = evaluateFraudSignals(paymentIntent, items);

        if (fraud.blocked) {
            console.warn(
                `[fraud] BLOCKED payment ${paymentIntentId} — risk: ${fraud.riskLevel},`,
                `outcome: ${fraud.outcomeType}, ip: ${ipAddress}`,
            );

            // First look up user before logging (best-effort)
            let fraudUserId: string | null = null;
            if (email) {
                const { data: u } = await supabaseAdmin.from('users').select('id').eq('email', email).maybeSingle();
                fraudUserId = u?.id ?? null;
            }

            await logFraudAttempt({
                userId:          fraudUserId,
                ipAddress,
                paymentIntentId,
                riskLevel:       fraud.riskLevel,
                outcomeType:     fraud.outcomeType,
                sellerMessage:   fraud.sellerMessage,
            });

            // Cancel the PaymentIntent so the customer is not charged
            await stripe.paymentIntents.cancel(paymentIntentId).catch((e: Error) =>
                console.error('[fraud] Could not cancel PI:', e.message),
            );

            return jsonResponse({ error: 'Pago rechazado por motivos de seguridad.' }, 402);
        }

        // ── 5. Look up the authenticated user by email ─────────────────────────
        let userId: string | null = null;
        if (email) {
            const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', email).maybeSingle();
            userId = user?.id ?? null;
        }

        // ── 6. Fetch canonical prices from DB (defense in depth) ────────────────
        const productIds = items.map((i: any) => i.id);
        const { data: products } = await supabaseAdmin.from('products').select('id, price').in('id', productIds);

        const formattedItems = items.map((item: any) => {
            const dbProduct = products?.find((p) => p.id === item.id);
            return {
                id:        item.id,
                variantId: item.variantId || null,
                name:      item.name,
                image:     item.image,
                size:      item.size    || null,
                quantity:  item.quantity,
                price:     dbProduct ? dbProduct.price : 0,  // DB price, not client price
            };
        });

        const amountTotal = paymentIntent.amount / 100;

        // ── 7. Atomic: check stock, create order, decrement stock, record coupon ───
        const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('checkout_reserve_stock_and_order', {
            p_items:             formattedItems,
            p_user_id:           userId,
            p_email:             email,
            p_payment_intent_id:  paymentIntentId,
            p_amount_total:      amountTotal,
            p_shipping_info:     shippingInfo || {},
            p_coupon_id:         couponId   || null,
            p_discount_amount:   discountAmount,
        });

        if (rpcError) {
            console.error('[confirm-payment-intent] Supabase RPC Error:', rpcError);
            return jsonResponse({ error: 'Error del servidor procesando la orden.' }, 500);
        }

        if (rpcResult && rpcResult.success) {
            // ── 8. Persist fraud signals + shipping cost + correct total on the order ─
            //    amountTotal = paymentIntent.amount / 100 (always includes shipping).
            //    The RPC may calculate total from item prices only, so we overwrite it
            //    here to match the actual Stripe charge amount.
            await supabaseAdmin
                .from('orders')
                .update({
                    fraud_risk_level:      fraud.riskLevel      || null,
                    fraud_review_required: fraud.reviewRequired,
                    payment_outcome_type:  fraud.outcomeType    || null,
                    shipping_cost:         shippingCost,
                    total:                 amountTotal,
                })
                .eq('id', rpcResult.order_id);

            if (fraud.reviewRequired) {
                console.warn(
                    `[fraud] Order ${rpcResult.order_id} flagged for review —`,
                    `risk: ${fraud.riskLevel}, outcome: ${fraud.outcomeType}, ip: ${ipAddress}`,
                );
            }

            // ── 9. Capture payment (stock is already reserved) ─────────────────
            try {
                await stripe.paymentIntents.capture(paymentIntentId);

                // Fetch the created order and items to send confirmation email
                const { data: rawOrderData } = await supabaseAdmin.from('orders').select('*, order_items(*)').eq('id', rpcResult.order_id).single();
                if (rawOrderData) {
                    // Override shipping_cost and total from PI metadata / amount to guarantee
                    // correctness (avoids any race condition between the DB update and this select)
                    const orderData = { ...rawOrderData, shipping_cost: shippingCost, total: amountTotal };
                    try {
                        const pdfBuffer = await generateInvoicePdf(orderData);
                        const sent = await sendOrderConfirmationEmail(orderData, orderData.order_items, pdfBuffer);
                        if (sent) {
                            await supabaseAdmin.from('orders').update({ email_sent: true }).eq('id', orderData.id);
                        }
                    } catch (emailErr: any) {
                        console.error('Email confirmation error:', emailErr.message);
                    }
                }

                return jsonResponse({ ok: true, order_id: rpcResult.order_id }, 200);

            } catch (stripeErr: any) {
                console.error('[confirm-payment-intent] Stripe Capture failed:', stripeErr);
                return jsonResponse({ error: 'El pago no pudo ser capturado por Stripe.' }, 500);
            }
        } else {
            // OUT OF STOCK - CANCEL PAYMENT
            try {
                await stripe.paymentIntents.cancel(paymentIntentId);
            } catch (stripeErr: any) {
                console.error('[confirm-payment-intent] Stripe Cancel failed:', stripeErr);
            }

            let errorMessage = rpcResult?.error || 'Lo sentimos, este producto acaba de agotarse y ya no está disponible.';
            if (errorMessage === 'Sorry, this product just went out of stock.') {
                errorMessage = 'Lo sentimos, este producto acaba de agotarse y ya no está disponible.';
            }

            return jsonResponse({
                error: errorMessage,
                failed_product_id: rpcResult?.failed_product_id
            }, 400);
        }

    } catch (err: any) {
        console.error('[confirm-payment-intent] Exception:', err);
        return jsonResponse({ error: 'Error interno de confirmación.' }, 500);
    }
};
