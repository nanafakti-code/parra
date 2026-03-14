/**
 * POST /api/stripe/confirm-order
 *
 * Endpoint de respaldo para garantizar que el email de confirmación se envía
 * aunque el webhook de Stripe no haya llegado al servidor (p.ej. en desarrollo
 * o si el webhook falló). Se llama desde /success tras el pago.
 *
 * Flujo:
 * 1. Recibe el session_id desde el body.
 * 2. Verifica con Stripe que la sesión está realmente pagada (payment_status: paid).
 * 3. Busca la orden en Supabase por stripe_session_id.
 * 4. Si la orden existe y email_sent = false, envía el email y lo marca como enviado.
 * 5. Si la orden NO existe, ejecuta el flujo completo de creación (webhook tardío).
 */

import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { getStripe } from '../../../lib/stripe';
import { supabaseAdmin } from '../../../lib/supabase';
import { generateInvoicePdf } from '../../../lib/pdf';
import { sendOrderConfirmationEmail } from '../../../lib/email/index';

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

function jsonResponse(data: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const POST: APIRoute = async ({ request }) => {
    let sessionId: string;

    try {
        const body = await request.json();
        sessionId = body?.session_id;
    } catch {
        return jsonResponse({ error: 'Body inválido.' }, 400);
    }

    if (!sessionId || !sessionId.startsWith('cs_')) {
        return jsonResponse({ error: 'session_id inválido.' }, 400);
    }

    try {
        // 1. Verificar con Stripe que el pago está realmente completado
        const session = await getStripe().checkout.sessions.retrieve(sessionId, {
            expand: ['line_items.data.price.product'],
        });

        if (session.payment_status !== 'paid') {
            console.warn(`[confirm-order] Session ${sessionId} no está pagada: ${session.payment_status}`);
            return jsonResponse({ error: 'El pago no está completado.' }, 402);
        }

        // 2. Buscar si la orden ya existe en la BD
        const { data: existingOrder } = await supabaseAdmin
            .from('orders')
            .select('*, order_items(*)')
            .eq('stripe_session_id', sessionId)
            .maybeSingle();

        if (existingOrder) {
            // Orden ya creada por el webhook
            if (existingOrder.email_sent) {
                console.log(`[confirm-order] Email ya enviado para orden ${existingOrder.id}, nada que hacer.`);
                return jsonResponse({ ok: true, already_sent: true }, 200);
            }

            // Orden existe pero email no fue enviado → reenviar
            console.log(`[confirm-order] Reenviando email para orden ${existingOrder.id}...`);
            try {
                const items = existingOrder.order_items || [];
                const pdfBuffer = await generateInvoicePdf({ ...existingOrder, order_items: items });
                const sent = await sendOrderConfirmationEmail(existingOrder, items, pdfBuffer);

                if (sent) {
                    await supabaseAdmin
                        .from('orders')
                        .update({ email_sent: true })
                        .eq('id', existingOrder.id);
                    console.log(`[confirm-order] Email enviado correctamente para orden ${existingOrder.id}.`);
                }
            } catch (err: any) {
                console.error(`[confirm-order] Error enviando email:`, err.message);
            }

            return jsonResponse({ ok: true, order_id: existingOrder.id }, 200);
        }

        // 3. Orden no existe: el webhook no llegó o está tardando → crear la orden aquí
        console.log(`[confirm-order] Orden no encontrada para session ${sessionId}, creando...`);

        const lineItems = (session.line_items?.data ?? []) as unknown as ExpandedLineItem[];
        if (lineItems.length === 0) {
            return jsonResponse({ error: 'No se encontraron productos en la sesión.' }, 500);
        }

        const metadata = session.metadata ?? {};
        const email = session.customer_details?.email ?? metadata.email ?? '';
        const amountTotal = session.amount_total ? session.amount_total / 100 : 0;

        // Extract charge ID from payment intent
        let stripeChargeId: string | null = null;
        if (session.payment_intent) {
            try {
                const paymentIntent = await getStripe().paymentIntents.retrieve(session.payment_intent as string);
                if (paymentIntent.charges.data.length > 0) {
                    stripeChargeId = paymentIntent.charges.data[0].id;
                    console.log(`[confirm-order] Extracted charge ID: ${stripeChargeId}`);
                }
            } catch (err: any) {
                console.warn(`[confirm-order] Error retrieving payment intent: ${err.message}`);
            }
        }

        // Buscar usuario por email
        let userId: string | null = null;
        if (email) {
            const { data: user } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('email', email)
                .maybeSingle();
            userId = user?.id ?? null;
        }

        // Crear orden
        const { data: newOrder, error: orderError } = await supabaseAdmin
            .from('orders')
            .insert({
                user_id: userId,
                email,
                stripe_session_id: sessionId,
                stripe_charge_id: stripeChargeId,
                status: 'pending',
                subtotal: amountTotal,
                total: amountTotal,
                shipping_name: metadata.shipping_name ?? null,
                shipping_street: metadata.shipping_address ?? null,
                shipping_city: metadata.shipping_city ?? null,
                shipping_postal_code: metadata.shipping_zip ?? null,
                shipping_phone: metadata.shipping_phone ?? null,
                email_sent: false,
            })
            .select('*')
            .single();

        if (orderError || !newOrder) {
            // Puede que el webhook haya creado la orden justo a la vez (race condition)
            const { data: raceOrder } = await supabaseAdmin
                .from('orders')
                .select('id, email_sent, email')
                .eq('stripe_session_id', sessionId)
                .maybeSingle();

            if (raceOrder) {
                console.log(`[confirm-order] Race condition detectado, orden ${raceOrder.id} ya fue creada por webhook.`);
                return jsonResponse({ ok: true, order_id: raceOrder.id }, 200);
            }

            console.error('[confirm-order] Error al crear orden:', orderError?.message);
            return jsonResponse({ error: 'Error al crear la orden.' }, 500);
        }

        const insertedItems: any[] = [];

        // Crear order_items y decrementar stock
        for (const item of lineItems) {
            const product = item.price?.product;
            if (!product) continue;

            const productId = product.metadata?.productId;
            const variantId = product.metadata?.variantId || null;
            const size = product.metadata?.size || null;
            const quantity = item.quantity ?? 1;
            const unitPrice = item.price?.unit_amount ? item.price.unit_amount / 100 : 0;
            const productImage = product.images?.[0] ?? null;

            const newItem = {
                order_id: newOrder.id,
                product_id: productId,
                variant_id: variantId,
                product_name: product.name,
                product_image: productImage,
                size,
                quantity,
                unit_price: unitPrice,
                total_price: unitPrice * quantity,
            };

            const { error: itemError } = await supabaseAdmin
                .from('order_items')
                .insert(newItem);

            if (itemError) {
                console.error(`[confirm-order] Error al insertar order_item para producto ${productId}:`, itemError.message);
                // No decrementar stock si el item no se registró correctamente
                continue;
            }
            insertedItems.push(newItem);

            // Decrementar stock
            if (productId) {
                const rpcName = variantId ? 'decrement_variant_stock_atomic' : 'decrement_product_stock_atomic';
                const rpcParam = variantId
                    ? { variant_id: variantId, quantity }
                    : { product_id: productId, quantity };

                const { error: stockErr } = await supabaseAdmin.rpc(rpcName, rpcParam);
                if (stockErr) {
                    console.warn(`[confirm-order] Error decrementando stock:`, stockErr.message);
                }
            }
        }

        // Enviar email
        try {
            const orderForEmail = { ...newOrder, order_items: insertedItems };
            const pdfBuffer = await generateInvoicePdf(orderForEmail);
            const sent = await sendOrderConfirmationEmail(orderForEmail, insertedItems, pdfBuffer);

            if (sent) {
                await supabaseAdmin
                    .from('orders')
                    .update({ email_sent: true })
                    .eq('id', newOrder.id);
                console.log(`[confirm-order] Orden ${newOrder.id} creada y email enviado.`);
            } else {
                console.warn(`[confirm-order] Orden ${newOrder.id} creada pero email falló.`);
            }
        } catch (emailErr: any) {
            console.error(`[confirm-order] Error enviando email:`, emailErr.message);
        }

        return jsonResponse({ ok: true, order_id: newOrder.id }, 200);

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error interno';
        console.error('[confirm-order] Error:', msg);
        return jsonResponse({ error: 'Error procesando la confirmación.' }, 500);
    }
};
