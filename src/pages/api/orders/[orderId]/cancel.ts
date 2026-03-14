/**
 * src/pages/api/orders/[orderId]/cancel.ts
 *
 * Endpoint para cancelar pedidos en estado PENDING o PROCESSING.
 * Reembolsa el costo del producto (excluyendo envío).
 * POST /api/orders/[orderId]/cancel
 */

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '../../../../lib/supabase';
import Stripe from 'stripe';
import { sendCancellationConfirmation } from '../../../../lib/email/index';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

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

    // Get authenticated user from cookies
    const accessToken =
      context.cookies.get('sb-access-token')?.value ||
      context.cookies.get('auth_token')?.value;

    let userId: string | null = null;
    if (accessToken) {
      const { data: { user } } = await supabase.auth.getUser(accessToken);
      userId = user?.id || null;
    }

    // Fetch order with ALL necessary data
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

    // Validate order belongs to user (if authenticated) or is guest order
    if (userId && order.user_id !== userId) {
      return errorResponse({
        code: 'UNAUTHORIZED',
        message: 'You do not have permission to cancel this order',
        status: 403,
      });
    }

    // Validate order status
    const validStatuses = ['pending', 'processing'];
    if (!validStatuses.includes(order.status)) {
      return errorResponse({
        code: 'INVALID_STATUS',
        message: `Cannot cancel order with status "${order.status}". Only pending or processing orders can be cancelled.`,
        status: 400,
      });
    }

    // Validate order has payment info for refund
    if (!order.stripe_payment_intent_id && !order.stripe_session_id) {
      return errorResponse({
        code: 'NO_PAYMENT_DATA',
        message: 'Unable to process refund: No payment information found',
        status: 400,
      });
    }

    // Calculate refund amount (product only, exclude shipping)
    const refundAmount = Math.round((order.subtotal - (order.discount || 0)) * 100); // Convert to cents

    if (refundAmount <= 0) {
      return errorResponse({
        code: 'INVALID_REFUND',
        message: 'Refund amount must be greater than 0',
        status: 400,
      });
    }

    // Get charge ID from order or retrieve from Stripe
    let chargeId = order.stripe_charge_id;

    if (!chargeId && order.stripe_session_id) {
      // If not stored locally, retrieve from Stripe using session_id
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
        if (session.payment_intent) {
          const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string);
          if (paymentIntent.charges.data.length > 0) {
            chargeId = paymentIntent.charges.data[0].id;
          }
        }
      } catch (err: any) {
        console.error('[cancel-order] Error retrieving charge from Stripe:', err.message);
        // Continue - will fail on refund attempt below
      }
    }

    if (!chargeId) {
      return errorResponse({
        code: 'NO_CHARGE_ID',
        message: 'Unable to process refund: No charge ID found',
        status: 400,
      });
    }

    let refund;
    try {
      refund = await stripe.refunds.create({
        charge: chargeId,
        amount: refundAmount,
        metadata: {
          order_id: orderId,
          reason: 'customer_cancellation',
          refund_type: 'product_only',
        },
      });

      if (!refund || refund.status !== 'succeeded') {
        throw new Error(`Refund failed with status: ${refund?.status}`);
      }
    } catch (stripeError: any) {
      console.error('[cancel-order] Stripe error:', stripeError.message);
      return errorResponse({
        code: 'STRIPE_ERROR',
        message: `Failed to process refund: ${stripeError.message}`,
        status: 402,
      });
    }

    // Update order status to cancelled
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('[cancel-order] Database error:', updateError);
      return errorResponse({
        code: 'DATABASE_ERROR',
        message: 'Failed to update order status',
        status: 500,
      });
    }

    // Send confirmation email
    try {
      await sendCancellationConfirmation({
        customerEmail: order.email,
        customerName: order.shipping_name || 'Cliente',
        orderNumber: order.order_number || `PG-${String(order.id).slice(-8).toUpperCase()}`,
        refundAmount: refundAmount / 100,
        refundId: refund.id,
      });
    } catch (emailError) {
      console.error('[cancel-order] Email error:', emailError);
      // Don't fail the request if email fails
    }

    // Log admin action
    try {
      await supabaseAdmin.from('admin_logs').insert({
        admin_id: 'system',
        action: 'cancel_order',
        resource_type: 'order',
        resource_id: orderId,
        details: {
          refund_amount: refundAmount / 100,
          refund_id: refund.id,
          original_status: order.status,
        },
      });
    } catch (logError) {
      console.error('[cancel-order] Logging error:', logError);
      // Don't fail the request if logging fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Order cancelled successfully',
        refund: {
          id: refund.id,
          amount: refundAmount / 100,
          status: refund.status,
        },
        order: {
          id: order.id,
          status: 'cancelled',
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[cancel-order] Unexpected error:', error);
    return errorResponse({
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      status: 500,
    });
  }
};
