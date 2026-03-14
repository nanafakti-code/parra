/**
 * src/pages/api/admin/returns/[returnId]/approve.ts
 *
 * Endpoint para aprobar una devolución y procesar el refund.
 * PATCH /api/admin/returns/[returnId]/approve
 */

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { validateAdminAPI } from '../../../../../lib/admin';
import { sendReturnApprovalConfirmation } from '../../../../../lib/email/index';
import { generateReturnInvoicePdf } from '../../../../../lib/pdf';
import { getStripe } from '../../../../../lib/stripe';

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

export const PATCH: APIRoute = async (context) => {
  try {
    const { returnId } = context.params;
    if (!returnId) {
      return errorResponse({
        code: 'INVALID_REQUEST',
        message: 'Return ID is required',
        status: 400,
      });
    }

    // Validate admin
    const adminResult = await validateAdminAPI(context.request, context.cookies);
    if (adminResult instanceof Response) return adminResult;
    const admin = adminResult.admin;

    const body = await context.request.json();
    const { adminNotes } = body;

    // Fetch return request
    const { data: returnRecord, error: returnError } = await supabaseAdmin
      .from('returns')
      .select('*')
      .eq('id', returnId)
      .single();

    if (returnError || !returnRecord) {
      return errorResponse({
        code: 'RETURN_NOT_FOUND',
        message: 'Return request not found',
        status: 404,
      });
    }

    // Validate return status
    if (returnRecord.status !== 'pending') {
      return errorResponse({
        code: 'INVALID_STATUS',
        message: `Cannot approve return with status "${returnRecord.status}". Only pending returns can be approved.`,
        status: 400,
      });
    }

    // Fetch order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', returnRecord.order_id)
      .single();

    if (orderError || !order) {
      return errorResponse({
        code: 'ORDER_NOT_FOUND',
        message: 'Associated order not found',
        status: 404,
      });
    }

    // Calculate refund amount (product only, exclude shipping)
    const refundAmount = Math.round((order.subtotal - (order.discount || 0)) * 100); // cents

    if (refundAmount <= 0) {
      return errorResponse({
        code: 'INVALID_REFUND',
        message: 'Refund amount must be greater than 0',
        status: 400,
      });
    }

    // Need at least one Stripe identifier
    if (!order.stripe_payment_intent_id && !order.stripe_session_id) {
      return errorResponse({
        code: 'NO_PAYMENT_DATA',
        message: 'Unable to process refund: No payment information found',
        status: 400,
      });
    }

    // Resolve payment intent ID — try direct field first, then via session
    let paymentIntentId: string | null = order.stripe_payment_intent_id || null;
    const stripe = getStripe();

    if (!paymentIntentId && order.stripe_session_id) {
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
        if (session.payment_intent) {
          paymentIntentId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent.id;
        }
      } catch (err: any) {
        console.error('[approve-return] Error retrieving session:', err.message);
      }
    }

    if (!paymentIntentId) {
      return errorResponse({
        code: 'NO_PAYMENT_INTENT',
        message: 'Unable to process refund: No payment intent found',
        status: 400,
      });
    }

    // Process Stripe refund using payment_intent with idempotency key
    let refund;
    const idempotencyKey = `return-${returnId}-${order.id}`;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: refundAmount,
          metadata: {
            return_id: returnId,
            order_id: order.id,
            reason: returnRecord.reason,
            refund_type: 'product_only',
          },
        },
        { idempotencyKey }
      );

      if (!refund || refund.status === 'failed') {
        throw new Error(`Refund failed with status: ${refund?.status}`);
      }
    } catch (stripeError: any) {
      console.error('[approve-return] Stripe error:', stripeError.message);
      return errorResponse({
        code: 'STRIPE_ERROR',
        message: `Failed to process refund: ${stripeError.message}`,
        status: 402,
      });
    }

    // Update return record
    const { error: updateReturnError } = await supabaseAdmin
      .from('returns')
      .update({
        status: 'refunded',
        refund_amount: refundAmount / 100,
        stripe_refund_id: refund.id,
        admin_notes: adminNotes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', returnId);

    if (updateReturnError) {
      console.error('[approve-return] Error updating return:', updateReturnError);
      return errorResponse({
        code: 'DATABASE_ERROR',
        message: 'Failed to update return record',
        status: 500,
      });
    }

    // Update order status to refunded
    const { error: updateOrderError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'refunded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (updateOrderError) {
      console.error('[approve-return] Error updating order:', updateOrderError);
      return errorResponse({
        code: 'DATABASE_ERROR',
        message: 'Failed to update order status',
        status: 500,
      });
    }

    // Log admin action
    try {
      await supabaseAdmin.from('admin_logs').insert({
        admin_id: admin.id,
        action: 'approve_return',
        resource_type: 'return',
        resource_id: returnId,
        details: {
          order_id: order.id,
          refund_amount: refundAmount / 100,
          refund_id: refund.id,
          reason: returnRecord.reason,
        },
      });
    } catch (logError) {
      console.error('[approve-return] Logging error:', logError);
    }

    // Send approval email
    try {
      // Build a return record object with the refund data for PDF generation
      const returnForPdf = {
        ...returnRecord,
        refund_amount: refundAmount / 100,
        stripe_refund_id: refund.id,
      };
      let pdfBuffer: Buffer | undefined;
      try {
        pdfBuffer = await generateReturnInvoicePdf(returnForPdf, order);
      } catch (pdfError) {
        console.error('[approve-return] PDF generation error:', pdfError);
      }
      await sendReturnApprovalConfirmation({
        customerEmail: order.email,
        customerName: order.shipping_name || 'Cliente',
        orderNumber: order.order_number || `PG-${String(order.id).slice(-8).toUpperCase()}`,
        refundAmount: refundAmount / 100,
        refundId: refund.id,
        pdfBuffer,
      });
    } catch (emailError) {
      console.error('[approve-return] Email error:', emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Return approved and refund processed',
        return: {
          id: returnId,
          status: 'refunded',
          refund_amount: refundAmount / 100,
          stripe_refund_id: refund.id,
        },
        order: {
          id: order.id,
          status: 'refunded',
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[approve-return] Unexpected error:', error);
    return errorResponse({
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
      status: 500,
    });
  }
};
