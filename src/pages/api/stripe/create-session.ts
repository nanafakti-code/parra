import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';
import { supabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { items, shippingInfo, email } = await request.json();

        // 1. Validate items and prices from database (NEVER trust frontend prices)
        const productIds = items.map((item: any) => item.id);
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('*')
            .in('id', productIds);

        if (productsError || !products) {
            return new Response(JSON.stringify({ error: 'Error al validar productos' }), { status: 400 });
        }

        // 2. Build line items for Stripe
        const line_items = items.map((item: any) => {
            const dbProduct = products.find((p) => p.id === item.id);
            if (!dbProduct) throw new Error(`Producto no encontrado: ${item.id}`);

            // Stock check
            if (dbProduct.stock < item.quantity) {
                throw new Error(`Stock insuficiente para ${item.name}`);
            }

            return {
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: item.name + (item.size ? ` (Talla ${item.size})` : ''),
                        images: [item.image],
                        metadata: {
                            productId: item.id,
                            variantId: item.variantId || '',
                            size: item.size || '',
                        }
                    },
                    unit_amount: Math.round(dbProduct.price * 100), // Stripe uses cents
                },
                quantity: item.quantity,
            };
        });

        const origin = request.headers.get('origin');

        // 3. Create Stripe Session
        const session = await stripe.checkout.sessions.create({
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
                cartSessionId: request.method === 'POST' ? (await request.clone().json()).cartSessionId : '',
            },
        });

        return new Response(JSON.stringify({ url: session.url }), { status: 200 });
    } catch (error: any) {
        console.error('Stripe Session Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
