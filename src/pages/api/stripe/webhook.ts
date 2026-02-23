import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
    const signature = request.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || import.meta.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
        return new Response('Webhook Secret or Signature missing', { status: 400 });
    }

    const body = await request.text();
    let event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;

        try {
            // 1. Get order details from Stripe (includes line items)
            const sessionWithLineItems = await stripe.checkout.sessions.retrieve(
                session.id,
                { expand: ['line_items.data.price.product'] }
            );

            const email = session.customer_details?.email;
            const amountTotal = session.amount_total ? session.amount_total / 100 : 0;

            // 2. Create Order in Supabase
            const { data: order, error: orderError } = await supabaseAdmin
                .from('orders')
                .insert({
                    email: email,
                    total: amountTotal,
                    status: 'PAID',
                    stripe_session_id: session.id,
                    shipping: session.metadata,
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // 3. Process each item: create order_items and decrement stock
            const lineItems = sessionWithLineItems.line_items?.data || [];
            const cartSessionId = session.metadata?.cartSessionId;

            for (const item of lineItems) {
                const product = item.price?.product as any;
                const metadata = product?.metadata || {};
                const productId = metadata.productId;
                const quantity = item.quantity || 1;

                // Add to order_items
                await supabaseAdmin.from('order_items').insert({
                    order_id: order.id,
                    product_id: productId,
                    quantity: quantity,
                    price: item.price?.unit_amount ? item.price.unit_amount / 100 : 0,
                });

                // Atomic Stock Decrement & Reservation Cleanup
                await supabaseAdmin.rpc('decrement_stock', {
                    row_id: productId,
                    amount: quantity
                });

                // Delete reservation for this session/product
                if (cartSessionId) {
                    await supabaseAdmin
                        .from('stock_reservations')
                        .delete()
                        .eq('cart_session_id', cartSessionId)
                        .eq('product_id', productId);
                }
            }

            console.log(`Order ${order.id} processed successfully`);
        } catch (err: any) {
            console.error('Error processing order flow:', err);
            return new Response('Error processing order', { status: 500 });
        }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
};
