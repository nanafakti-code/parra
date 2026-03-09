import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse, logAdminAction } from '../../../lib/admin';
import { sendShippingUpdate, sendOrderDelivered } from '../../../lib/email/index';

/** GET /api/admin/orders?status=...&page=1&limit=20&search=... */
export const GET: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const search = url.searchParams.get('search')?.trim();
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
        .from('orders')
        .select('*, users(name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
        query = query.eq('status', status);
    }

    if (search) {
        query = query.or(`id.ilike.%${search}%,users.name.ilike.%${search}%,users.email.ilike.%${search}%`);
    }

    const { data, count, error } = await query;

    if (error) {
        console.error('[admin-orders] Error:', error);
        return jsonResponse({ error: 'Error al obtener pedidos' }, 500);
    }

    return jsonResponse({
        orders: data || [],
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit),
    });
};

/** PATCH /api/admin/orders – Update order status */
export const PATCH: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { orderId, status, trackingNumber, notes } = body;

        if (!orderId || !status) {
            return jsonResponse({ error: 'orderId y status son obligatorios' }, 400);
        }

        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
        if (!validStatuses.includes(status)) {
            return jsonResponse({ error: 'Estado inválido' }, 400);
        }

        const updateData: Record<string, any> = {
            status,
            updated_at: new Date().toISOString(),
        };
        if (trackingNumber !== undefined) updateData.tracking_number = trackingNumber;
        if (notes !== undefined) updateData.admin_notes = notes;

        const { data, error } = await supabaseAdmin
            .from('orders')
            .update(updateData)
            .eq('id', orderId)
            .select()
            .single();

        if (error) {
            console.error('[admin-orders] Update error:', error);
            return jsonResponse({ error: 'Error al actualizar pedido' }, 500);
        }

        await logAdminAction(admin.id, 'update_order_status', 'order', orderId, {
            newStatus: status,
            trackingNumber: trackingNumber || null,
        }, request.headers.get('x-forwarded-for') || undefined);

        // ── Disparar emails transaccionales según el nuevo estado ──────────────
        const customerEmail = data.email;
        const customerName = data.shipping_name || 'Cliente';
        const orderNum = data.order_number || `PG-${String(data.id).slice(-8).toUpperCase()}`;

        if (customerEmail) {
            try {
                if (status === 'shipped') {
                    await sendShippingUpdate({
                        customerEmail,
                        customerName,
                        orderNumber: orderNum,
                        trackingNumber: trackingNumber || data.tracking_number || undefined,
                        shippingCompany: 'Correos / MRW',
                    });
                } else if (status === 'delivered') {
                    await sendOrderDelivered({
                        customerEmail,
                        customerName,
                        orderNumber: orderNum,
                    });
                }
            } catch (emailErr: any) {
                // No bloqueamos la respuesta si el email falla
                console.warn('[admin-orders] Email no enviado:', emailErr.message);
            }
        }

        return jsonResponse({ order: data, message: 'Pedido actualizado' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};
