import type { APIRoute } from 'astro';
import { getStripe } from '../../../lib/stripe';
import { supabase } from '../../../lib/supabase';
import { paymentLimiter } from '../../../lib/security/rateLimiter';
import { getClientIp } from '../../../lib/security/getClientIp';

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
        const { items, shippingInfo, email } = body;

        if (!Array.isArray(items) || items.length === 0) {
            return jsonResponse({ error: 'El carrito está vacío.' }, 400);
        }

        const productIds = items.map((item) => item.id);
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, name, price, stock')
            .in('id', productIds);

        if (productsError || !products) {
            return jsonResponse({ error: 'Error al validar productos.' }, 500);
        }

        let amountTotal = 0;
        const line_items = items.map((item) => {
            const dbProduct = products.find((p) => p.id === item.id);
            if (!dbProduct) throw new Error(`Producto no encontrado: ${item.id}`);
            if (dbProduct.stock < item.quantity) {
                // Warning, but stock validation is final on capture. 
                // We don't block here strictly unless we want to, but we might.
                // Actually blocking here is good UX.
                throw new Error(`Stock insuficiente para "${dbProduct.name}".`);
            }
            amountTotal += Math.round(dbProduct.price * 100) * item.quantity;
            return item;
        });

        // Create PaymentIntent
        const paymentIntent = await getStripe().paymentIntents.create({
            amount: amountTotal,
            currency: 'eur',
            payment_method_types: ['card'],
            capture_method: 'manual', // EXACTLY AS REQUESTED
            metadata: {
                shipping_name: shippingInfo?.firstName ? `${shippingInfo.firstName} ${shippingInfo.lastName || ''}` : '',
                shipping_address: shippingInfo?.address ?? '',
                shipping_city: shippingInfo?.city ?? '',
                shipping_zip: shippingInfo?.zip ?? '',
                shipping_phone: shippingInfo?.phone ?? '',
                email: email ?? '',
            },
        });

        return jsonResponse({ clientSecret: paymentIntent.client_secret }, 200);
    } catch (error: any) {
        return jsonResponse({ error: error.message || 'Error interno' }, 500);
    }
};
