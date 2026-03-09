import type { APIRoute } from 'astro';
import { getStripe } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabase';
import { generateInvoicePdf } from '../../../lib/pdf';
import { sendOrderConfirmationEmail } from '../../../lib/email/index';

function jsonResponse(data: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { paymentIntentId, items, shippingInfo, email } = body;

        if (!paymentIntentId) {
            return jsonResponse({ error: 'Falta paymentIntentId' }, 400);
        }

        const stripe = getStripe();
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'requires_capture') {
            return jsonResponse({ error: `Estado de pago inválido: ${paymentIntent.status}` }, 400);
        }

        // Search user by email if logged in
        let userId: string | null = null;
        if (email) {
            const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', email).maybeSingle();
            userId = user?.id ?? null;
        }

        // Format items for the DB
        // Add current price from DB to avoid price tampering directly, or trust the amount from Stripe
        // But the RPC expects price, so let's fetch products again.
        const productIds = items.map((i: any) => i.id);
        const { data: products } = await supabaseAdmin.from('products').select('id, price').in('id', productIds);

        const formattedItems = items.map((item: any) => {
            const dbProduct = products?.find(p => p.id === item.id);
            return {
                id: item.id,
                variantId: item.variantId || null,
                name: item.name,
                image: item.image,
                size: item.size || null,
                quantity: item.quantity,
                price: dbProduct ? dbProduct.price : 0
            };
        });

        const amountTotal = paymentIntent.amount / 100;

        // Perform the atomic transaction
        const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('checkout_reserve_stock_and_order', {
            p_items: formattedItems,
            p_user_id: userId,
            p_email: email,
            p_payment_intent_id: paymentIntentId,
            p_amount_total: amountTotal,
            p_shipping_info: shippingInfo || {}
        });

        if (rpcError) {
            console.error('[confirm-payment-intent] Supabase RPC Error:', rpcError);
            return jsonResponse({ error: 'Error del servidor procesando la orden.' }, 500);
        }

        if (rpcResult && rpcResult.success) {
            // STOCK RESERVED! CAPTURE PAYMENT!
            try {
                await stripe.paymentIntents.capture(paymentIntentId);

                // Fetch the created order and items to send confirmation email
                const { data: orderData } = await supabaseAdmin.from('orders').select('*, order_items(*)').eq('id', rpcResult.order_id).single();
                if (orderData) {
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
