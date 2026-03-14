/**
 * src/pages/api/orders/[orderId]/request-return.ts
 *
 * Endpoint para solicitar una devolución (solo para pedidos entregados).
 * POST /api/orders/[orderId]/request-return
 */

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '../../../../lib/supabase';

interface APIError {
  code: string;
  message: string;
  status: number;
}

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
    const { reason, notes } = body;

    if (!reason?.trim()) {
      return errorResponse({
        code: 'MISSING_REASON',
        message: 'Return reason is required',
        status: 400,
      });
    }

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

    // Fetch returns policy from site_settings
    const { data: settingsData } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('key', 'returns_policy')
      .single();

    const returnsPolicy = settingsData?.value || { days_limit: 30 };
    const daysLimit = returnsPolicy.days_limit || 30;

    // Calculate days since order updated (delivery date)
    const orderUpdatedAt = new Date(order.updated_at);
    const now = new Date();
    const daysSinceDelivery = Math.floor(
      (now.getTime() - orderUpdatedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Validate return window
    if (daysSinceDelivery > daysLimit) {
      return errorResponse({
        code: 'RETURN_WINDOW_EXPIRED',
        message: `Return window has expired. Orders can be returned within ${daysLimit} days of delivery.`,
        status: 400,
      });
    }

    // Check if return already exists
    const { data: existingReturn } = await supabaseAdmin
      .from('returns')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .single();

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
          notes: notes?.trim() || null,
          status: 'pending',
        },
      ])
      .select()
      .single();

    if (insertError || !returnRecord) {
      console.error('[request-return] Database error:', insertError);
      return errorResponse({
        code: 'DATABASE_ERROR',
        message: 'Failed to create return request',
        status: 500,
      });
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
