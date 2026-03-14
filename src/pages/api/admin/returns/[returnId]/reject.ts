/**
 * src/pages/api/admin/returns/[returnId]/reject.ts
 *
 * Endpoint para rechazar una devolución.
 * PATCH /api/admin/returns/[returnId]/reject
 */

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { validateAdminAPI } from '../../../../../lib/admin';
import { sendReturnRejectionNotification } from '../../../../../lib/email/index';

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
        message: `Cannot reject return with status "${returnRecord.status}". Only pending returns can be rejected.`,
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

    // Update return record
    const { error: updateError } = await supabaseAdmin
      .from('returns')
      .update({
        status: 'rejected',
        admin_notes: adminNotes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', returnId);

    if (updateError) {
      console.error('[reject-return] Error updating return:', updateError);
      return errorResponse({
        code: 'DATABASE_ERROR',
        message: 'Failed to update return record',
        status: 500,
      });
    }

    // Log admin action
    try {
      await supabaseAdmin.from('admin_logs').insert({
        admin_id: admin.id,
        action: 'reject_return',
        resource_type: 'return',
        resource_id: returnId,
        details: {
          order_id: order.id,
          reason: returnRecord.reason,
          admin_notes: adminNotes,
        },
      });
    } catch (logError) {
      console.error('[reject-return] Logging error:', logError);
    }

    // Send rejection email
    try {
      await sendReturnRejectionNotification({
        customerEmail: order.email,
        customerName: order.shipping_name || 'Cliente',
        orderNumber: order.order_number || `PG-${String(order.id).slice(-8).toUpperCase()}`,
        reason: adminNotes?.trim() || 'No especificado',
      });
    } catch (emailError) {
      console.error('[reject-return] Email error:', emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Return rejected',
        return: {
          id: returnId,
          status: 'rejected',
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[reject-return] Unexpected error:', error);
    return errorResponse({
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      status: 500,
    });
  }
};
