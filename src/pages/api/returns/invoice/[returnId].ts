/**
 * src/pages/api/returns/invoice/[returnId].ts
 *
 * Endpoint para descargar la nota de abono (factura de devolución) en PDF.
 * GET /api/returns/invoice/[returnId]
 */

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase';
import { generateReturnInvoicePdf } from '../../../../lib/pdf';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const authUser = locals.user;
    if (!authUser) {
      return new Response('No autenticado', { status: 401 });
    }

    const { returnId } = params;
    if (!returnId) {
      return new Response('ID requerido', { status: 400 });
    }

    // Fetch return record
    const { data: returnRecord, error: returnError } = await supabaseAdmin
      .from('returns')
      .select('*')
      .eq('id', returnId)
      .single();

    if (returnError || !returnRecord) {
      return new Response('Devolución no encontrada', { status: 404 });
    }

    // Only refunded returns have an invoice
    if (returnRecord.status !== 'refunded') {
      return new Response('La factura solo está disponible para devoluciones reembolsadas', { status: 400 });
    }

    // Verify ownership
    if (returnRecord.user_id !== authUser.id) {
      return new Response('Acceso denegado', { status: 403 });
    }

    // Fetch associated order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', returnRecord.order_id)
      .single();

    if (orderError || !order) {
      return new Response('Pedido asociado no encontrado', { status: 404 });
    }

    const pdfBuffer = await generateReturnInvoicePdf(returnRecord, order);
    const refDate = new Date(returnRecord.updated_at || returnRecord.created_at || Date.now());
    const refundId = returnRecord.stripe_refund_id || returnRecord.id || '';
    const returnNumber = `DEV-${refDate.getFullYear()}${String(refDate.getMonth()+1).padStart(2,'0')}${String(refDate.getDate()).padStart(2,'0')}-${refundId.slice(-6).toUpperCase()}`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="nota-abono-${returnNumber}.pdf"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err: any) {
    console.error('[ReturnInvoice] Error:', err?.message ?? err);
    return new Response(
      `Error al generar la nota de abono: ${err?.message ?? 'desconocido'}`,
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }
};
