import type { APIRoute } from 'astro';
import { getStripe } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabase';

function jsonResponse(data: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const { paymentIntentId, shippingMethod } = await request.json();

        if (!paymentIntentId || !shippingMethod) {
            return jsonResponse({ error: 'Faltan campos requeridos.' }, 400);
        }

        const method = shippingMethod === 'express' ? 'express' : 'standard';

        // Retrieve current PI to get stored subtotal/discount
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

        const subtotalCents = parseInt(pi.metadata?.subtotal_cents ?? '0') || 0;
        const discountCents = parseInt(pi.metadata?.discount_cents ?? '0') || 0;

        // Fetch shipping config from admin settings
        let shippingCostCents = 0;
        try {
            const { data: ss } = await supabaseAdmin
                .from('site_settings').select('value').eq('key', 'shipping').single();
            const cfg = (ss?.value as any) || {};
            const freeThreshold = Number(cfg.free_threshold ?? 50);
            const subtotalEuros = subtotalCents / 100;
            if (subtotalEuros < freeThreshold) {
                const cost = method === 'express'
                    ? Number(cfg.express_cost ?? 9.99)
                    : Number(cfg.standard_cost ?? 4.99);
                shippingCostCents = Math.round(cost * 100);
            }
        } catch { /* keep 0 */ }

        const newAmount = Math.max(50, subtotalCents - discountCents + shippingCostCents);

        await stripe.paymentIntents.update(paymentIntentId, {
            amount: newAmount,
            metadata: {
                ...pi.metadata,
                shipping_method: method,
                shipping_cost: (shippingCostCents / 100).toFixed(2),
            },
        });

        return jsonResponse({
            amount: newAmount,
            shippingCost: shippingCostCents / 100,
        }, 200);
    } catch (error: unknown) {
        console.error('[update-shipping]', error);
        return jsonResponse({ error: 'Error interno del servidor.' }, 500);
    }
};
