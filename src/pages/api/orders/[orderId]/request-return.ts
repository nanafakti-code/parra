/**
 * src/pages/api/orders/[orderId]/request-return.ts
 *
 * Endpoint para solicitar una devolución (solo para pedidos entregados).
 * POST /api/orders/[orderId]/request-return
 */

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '../../../../lib/supabase';
import { sendReturnRequestConfirmation } from '../../../../lib/email/index';

interface APIError {
  code: string;
  message: string;
  status: number;
}

interface SelectedItem { orderItemId: string; quantity: number }

function errorResponse(error: APIError) {
  return new Response(JSON.stringify(error), {
    status: error.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (context) => {
  try {
    const { orderId } = context.params;
    if (!orderId) {
      return errorResponse({
        code: 'INVALID_REQUEST',
        message: 'Order ID is required',
        status: 400,
      });
    }

    const body = await context.request.json();
    const { reason, images, items } = body;

    if (!reason?.trim()) {
      return errorResponse({
        code: 'MISSING_REASON',
        message: 'Return reason is required',
        status: 400,
      });
    }

    // Validate items: must be non-empty array of { orderItemId, quantity }
    if (!Array.isArray(items) || items.length === 0) {
      return errorResponse({
        code: 'MISSING_ITEMS',
        message: 'Debes seleccionar al menos un artículo para devolver',
        status: 400,
      });
    }

    const selectedItems: SelectedItem[] = [];    for (const item of items) {
      if (typeof item.orderItemId !== 'string' || typeof item.quantity !== 'number' || item.quantity < 1) {
        return errorResponse({
          code: 'INVALID_ITEMS',
          message: 'Formato de artículos inválido',
          status: 400,
        });
      }
      selectedItems.push({ orderItemId: item.orderItemId, quantity: Math.floor(item.quantity) });
    }

    // Validate images: must be an array of Cloudinary secure_url strings (max 5)
    const validImages: string[] = Array.isArray(images)
      ? images
          .filter((u: unknown) => typeof u === 'string' && u.startsWith('https://res.cloudinary.com/'))
          .slice(0, 5)
      : [];

    // Get authenticated user from cookies
    const accessToken =
      context.cookies.get('sb-access-token')?.value ||
      context.cookies.get('auth_token')?.value;

    if (!accessToken) {
      return errorResponse({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to request a return',
        status: 401,
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    const userId = user?.id;

    if (!userId || authError) {
      return errorResponse({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to request a return',
        status: 401,
      });
    }

    // Fetch order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return errorResponse({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
        status: 404,
      });
    }

    // Validate order belongs to user
    if (order.user_id !== userId) {
      return errorResponse({
        code: 'UNAUTHORIZED',
        message: 'You do not have permission to request a return for this order',
        status: 403,
      });
    }

    // Validate order status is delivered
    if (order.status !== 'delivered') {
      return errorResponse({
        code: 'INVALID_STATUS',
        message: `Cannot request return for order with status "${order.status}". Only delivered orders can be returned.`,
        status: 400,
      });
    }

    // Fetch order items, returns policy, existing return, and contact setting in parallel
    const [
      { data: orderItems, error: orderItemsError },
      { data: settingsData },
      { data: existingReturn },
      { data: contactSetting },
    ] = await Promise.all([
      supabaseAdmin
        .from('order_items')
        .select('id, unit_price, quantity, product_name, product_image, size')
        .eq('order_id', orderId),
      supabaseAdmin
        .from('site_settings')
        .select('value')
        .eq('key', 'returns_policy')
        .single(),
      supabaseAdmin
        .from('returns')
        .select('id')
        .eq('order_id', orderId)
        .eq('status', 'pending')
        .single(),
      supabaseAdmin
        .from('site_settings')
        .select('value')
        .eq('key', 'contact')
        .maybeSingle(),
    ]);

    if (orderItemsError || !orderItems?.length) {
      return errorResponse({
        code: 'ORDER_ITEMS_NOT_FOUND',
        message: 'No se encontraron artículos para este pedido',
        status: 404,
      });
    }

    const orderItemsMap = new Map(orderItems.map(oi => [oi.id, oi]));
    let refundAmount = 0;
    for (const item of selectedItems) {
      const orderItem = orderItemsMap.get(item.orderItemId);
      if (!orderItem) {
        return errorResponse({
          code: 'INVALID_ITEM',
          message: `El artículo ${item.orderItemId} no pertenece a este pedido`,
          status: 400,
        });
      }
      if (item.quantity > orderItem.quantity) {
        return errorResponse({
          code: 'INVALID_QUANTITY',
          message: `La cantidad a devolver (${item.quantity}) supera la cantidad comprada (${orderItem.quantity})`,
          status: 400,
        });
      }
      refundAmount += orderItem.unit_price * item.quantity;
    }
    refundAmount = Math.round(refundAmount * 100) / 100;

    const returnsPolicy = settingsData?.value || { days_limit: 30 };
    const daysLimit = returnsPolicy.days_limit || 30;

    const orderUpdatedAt = new Date(order.updated_at);
    const daysSinceDelivery = Math.floor(
      (Date.now() - orderUpdatedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceDelivery > daysLimit) {
      return errorResponse({
        code: 'RETURN_WINDOW_EXPIRED',
        message: `Return window has expired. Orders can be returned within ${daysLimit} days of delivery.`,
        status: 400,
      });
    }

    if (existingReturn) {
      return errorResponse({
        code: 'RETURN_ALREADY_EXISTS',
        message: 'A return request already exists for this order',
        status: 400,
      });
    }

    // Create return request
    const { data: returnRecord, error: insertError } = await supabaseAdmin
      .from('returns')
      .insert([
        {
          order_id: orderId,
          user_id: userId,
          reason: reason.trim(),
          status: 'pending',
          refund_amount: refundAmount,
          ...(validImages.length > 0 ? { images: validImages } : {}),
        },
      ])
      .select()
      .single();

    if (insertError || !returnRecord) {
      console.error('[request-return] Database error:', insertError);
      return errorResponse({
        code: 'DATABASE_ERROR',
        message: insertError?.message || insertError?.details || 'Failed to create return request',
        status: 500,
      });
    }

    // Insert return_items (partial return line items)
    const returnItemsToInsert = selectedItems.map(item => {
      const oi = orderItemsMap.get(item.orderItemId)!;
      return {
        return_id: returnRecord.id,
        order_item_id: item.orderItemId,
        product_name: oi.product_name,
        product_image: oi.product_image || null,
        size: oi.size || null,
        quantity: item.quantity,
        unit_price: oi.unit_price,
        total_price: Math.round(oi.unit_price * item.quantity * 100) / 100,
      };
    });

    const { error: returnItemsError } = await supabaseAdmin
      .from('return_items')
      .insert(returnItemsToInsert);
    if (returnItemsError) {
      console.error('[request-return] Error inserting return_items:', returnItemsError);
    }

    // Send confirmation email to customer
    try {
      const returnAddress: string = (contactSetting?.value as any)?.address?.trim() || '';

      await sendReturnRequestConfirmation({
        customerEmail: order.email,
        customerName: order.shipping_name || 'Cliente',
        orderNumber: order.order_number || `PG-${String(order.id).slice(-8).toUpperCase()}`,
        reason: reason.trim(),
        returnAddress,
      });
    } catch (emailError) {
      console.error('[request-return] Email error:', emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Return request submitted successfully',
        return: {
          id: returnRecord.id,
          status: returnRecord.status,
          daysRemaining: daysLimit - daysSinceDelivery,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[request-return] Unexpected error:', error);
    return errorResponse({
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      status: 500,
    });
  }
};
