/**
 * src/lib/email/index.ts
 *
 * Servicio de emails transaccionales con Resend.
 * Genera HTML puro (sin React/JSX) para evitar conflictos con Preact.
 * Dominio verificado: parragkgloves.es
 *
 * Exports: sendOrderConfirmation, sendShippingUpdate, sendOrderDelivered, sendPasswordReset, sendContactForm
 */

import { Resend } from 'resend';
import { supabaseAdmin } from '../supabase';

// ── Resend client ─────────────────────────────────────────────────────────────

function getResend(): Resend {
  const key = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!key) console.warn('[email] RESEND_API_KEY no configurada.');
  return new Resend(key || '');
}

const FROM = 'Parra GK Gloves <info@parragkgloves.es>';
const REPLY_TO = 'soporte@parragkgloves.es';

// ── Brand tokens ──────────────────────────────────────────────────────────────

const c = {
  bg: '#0a0a0a',
  card: '#0d0d0d',
  cardBorder: '#1a1a1a',
  gold: '#39FF14',        // color acento (se sobreescribe con el del admin)
  goldLight: '#57FF2A',   // variante clara (se sobreescribe con el del admin)
  white: '#ffffff',
  muted: '#9ca3af',
  subtle: '#6b7280',
  divider: '#1a1a1a',
};

// Aclara un hex acercando cada canal RGB hacia 255 (factor 0–1)
function lightenHex(hex: string, factor: number): string {
  const h = hex.replace('#', '');
  return '#' + [0, 2, 4]
    .map(i => {
      const v = parseInt(h.substring(i, i + 2), 16);
      return Math.round(v + (255 - v) * factor).toString(16).padStart(2, '0');
    })
    .join('');
}

// Carga el color de marca del admin y actualiza `c.gold` / `c.goldLight`
async function loadBrandColors(): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('site_settings').select('value').eq('key', 'brand').single();
    const raw = (data?.value as any)?.primary_color;
    if (raw && /^#[0-9a-fA-F]{6}$/.test(raw)) {
      c.gold = raw.toUpperCase();
      c.goldLight = lightenHex(raw, 0.35);
    }
  } catch { /* mantener default */ }
}

const fontStack = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac';
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Base layout ───────────────────────────────────────────────────────────────

function layout(previewText: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es" dir="ltr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Parra GK Gloves</title>
</head>
<body style="margin:0;padding:0;background-color:${c.bg};font-family:${fontStack};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;color:${c.bg};">${esc(previewText)}&nbsp;</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.bg};padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${c.card};border-radius:8px;border:1px solid ${c.cardBorder};overflow:hidden;">
        <!-- HEADER -->
        <tr>
          <td style="background-color:#000;padding:32px 40px 24px;text-align:center;border-bottom:3px solid ${c.gold};">
            <p style="margin:0;font-size:32px;font-weight:900;color:${c.white};letter-spacing:6px;text-transform:uppercase;font-family:${fontStack};">PARRA</p>
            <p style="margin:4px 0 0;font-size:10px;font-weight:700;color:${c.gold};letter-spacing:4px;text-transform:uppercase;font-family:${fontStack};">GOALKEEPER GLOVES</p>
          </td>
        </tr>
        <!-- CONTENT -->
        <tr><td>${body}</td></tr>
        <!-- FOOTER -->
        <tr><td style="border-top:1px solid ${c.divider};"></td></tr>
        <tr>
          <td style="background-color:#000;padding:32px 40px;text-align:center;">
            <p style="margin:0 0 16px;font-size:12px;color:${c.subtle};font-family:${fontStack};">
              <a href="https://www.parragkgloves.es/shop" style="color:${c.muted};text-decoration:none;margin:0 12px;">Tienda</a>
              <a href="mailto:info@parragkgloves.es" style="color:${c.muted};text-decoration:none;margin:0 12px;">Contacto</a>
              <a href="https://www.parragkgloves.es/profile?tab=devoluciones" style="color:${c.muted};text-decoration:none;margin:0 12px;">Devoluciones</a>
            </p>
            <p style="margin:0 0 8px;font-size:12px;color:${c.subtle};font-family:${fontStack};">Parra GK Gloves &mdash; info@parragkgloves.es</p>
            <p style="margin:0;font-size:11px;color:#4b5563;font-family:${fontStack};">&copy; ${new Date().getFullYear()} Parra Goalkeeper Gloves. Todos los derechos reservados.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── 1. Order Confirmation ─────────────────────────────────────────────────────

export interface OrderItem {
  product_name: string;
  product_image?: string;
  size?: string;
  quantity: number;
  unit_price: number;
}

export interface SendOrderConfirmationOptions {
  order: {
    id: string;
    order_number?: string;
    email: string;
    total?: number;
    subtotal?: number;
    shipping_cost?: number;
    shipping_name?: string;
    shipping_street?: string;
    shipping_city?: string;
    shipping_postal_code?: string;
    shipping_country?: string;
    shipping_phone?: string;
  };
  items: Array<OrderItem>;
  pdfBuffer?: Buffer;
}

function buildOrderConfirmationHtml(
  order: SendOrderConfirmationOptions['order'],
  items: OrderItem[],
): string {
  const firstName = (order.shipping_name || 'Cliente').split(' ')[0];
  const orderNumber = order.order_number || `PG-${String(order.id).slice(-8).toUpperCase()}`;
  const orderDate = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  const shipping = order.shipping_cost ?? 0;
  const total = order.total ?? 0;
  const subtotal = order.subtotal != null ? order.subtotal : (total - shipping);
  const address = [
    order.shipping_street,
    order.shipping_city,
    order.shipping_postal_code,
    order.shipping_country || 'Espa\u00f1a',
  ].filter(Boolean).join(', ');

  const itemsRows = items.map(item => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${c.divider};vertical-align:top;width:56px;">
          ${item.product_image
      ? `<img src="${esc(item.product_image)}" width="56" height="56" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:4px;display:block;" />`
      : `<div style="width:56px;height:56px;background-color:#1a1a1a;border-radius:4px;"></div>`}
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid ${c.divider};vertical-align:top;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${c.white};font-family:${fontStack};">${esc(item.product_name)}</p>
          ${item.size ? `<p style="margin:0;font-size:12px;color:${c.subtle};font-family:${fontStack};">Talla: ${esc(item.size)}</p>` : ''}
          <p style="margin:4px 0 0;font-size:12px;color:${c.muted};font-family:${fontStack};">Cantidad: ${item.quantity}</p>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid ${c.divider};vertical-align:top;text-align:right;white-space:nowrap;">
          <p style="margin:0;font-size:15px;font-weight:700;color:${c.white};font-family:${fontStack};">${fmt(item.unit_price * item.quantity)}</p>
          ${item.quantity > 1 ? `<p style="margin:2px 0 0;font-size:11px;color:${c.subtle};font-family:${fontStack};">${fmt(item.unit_price)} / ud.</p>` : ''}
        </td>
      </tr>`).join('');

  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.card};">
      <tr>
        <td style="padding:40px 40px 0;text-align:center;">
          <div style="width:64px;height:64px;background-color:${c.gold};border-radius:50%;display:inline-block;line-height:64px;margin:0 auto 20px;">
            <span style="font-size:28px;color:#000;font-weight:900;line-height:64px;font-family:${fontStack};">&#10003;</span>
          </div>
          <p style="margin:0 0 8px;font-size:26px;font-weight:900;color:${c.white};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">
            &iexcl;Pedido <span style="color:${c.gold};">Confirmado</span>!
          </p>
          <p style="margin:0 0 32px;font-size:15px;color:${c.muted};line-height:1.6;font-family:${fontStack};">
            Hola <strong style="color:${c.white};">${esc(firstName)}</strong>, hemos recibido tu pedido y lo estamos preparando.<br/>
            Encontrar&aacute;s la factura adjunta a este correo en formato PDF.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border-left:3px solid ${c.gold};border-radius:4px;padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="50%" style="vertical-align:top;padding-bottom:12px;">
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">N&ordm; DE PEDIDO</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:${c.white};font-family:${fontStack};">${esc(orderNumber)}</p>
                </td>
                <td width="50%" style="vertical-align:top;padding-bottom:12px;">
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">FECHA</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:${c.white};font-family:${fontStack};">${orderDate}</p>
                </td>
              </tr>
              <tr>
                <td colspan="2">
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">DIRECCI&Oacute;N DE ENV&Iacute;O</p>
                  <p style="margin:0;font-size:14px;color:${c.white};font-family:${fontStack};">${esc(order.shipping_name || '')}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:${c.muted};font-family:${fontStack};">${esc(address)}</p>
                  ${order.shipping_phone ? `<p style="margin:2px 0 0;font-size:13px;color:${c.muted};font-family:${fontStack};">${esc(order.shipping_phone)}</p>` : ''}
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">PRODUCTOS</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">${itemsRows}</table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border-radius:4px;padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:4px 0;"><p style="margin:0;font-size:14px;color:${c.muted};font-family:${fontStack};">Subtotal</p></td>
                <td style="padding:4px 0;text-align:right;"><p style="margin:0;font-size:14px;color:${c.white};font-family:${fontStack};">${fmt(subtotal)}</p></td>
              </tr>
              <tr>
                <td style="padding:4px 0;"><p style="margin:0;font-size:14px;color:${c.muted};font-family:${fontStack};">Env&iacute;o</p></td>
                <td style="padding:4px 0;text-align:right;"><p style="margin:0;font-size:14px;color:${c.white};font-family:${fontStack};">${shipping === 0 ? 'Gratis' : fmt(shipping)}</p></td>
              </tr>
              <tr>
                <td style="padding:12px 0 0;border-top:1px solid ${c.divider};"><p style="margin:0;font-size:16px;font-weight:700;color:${c.white};font-family:${fontStack};">Total</p></td>
                <td style="padding:12px 0 0;border-top:1px solid ${c.divider};text-align:right;"><p style="margin:0;font-size:18px;font-weight:900;color:${c.gold};font-family:${fontStack};">${fmt(total)}</p></td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 40px;text-align:center;">
          <a href="https://www.parragkgloves.es/profile?tab=pedidos" style="display:inline-block;background-color:${c.gold};color:#000;font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 40px;border-radius:4px;font-family:${fontStack};">VER MI PEDIDO &rarr;</a>
        </td>
      </tr>
    </table>`;

  return layout(`Pedido ${orderNumber} confirmado \u00b7 Gracias por confiar en Parra GK Gloves.`, body);
}

export async function sendOrderConfirmation({ order, items, pdfBuffer }: SendOrderConfirmationOptions) {
  await loadBrandColors();
  const resend = getResend();
  const orderNumber = order.order_number || `PG-${String(order.id).slice(-8).toUpperCase()}`;
  const html = buildOrderConfirmationHtml(order, items);

  const attachments: { filename: string; content: Buffer }[] = [];
  if (pdfBuffer) {
    attachments.push({ filename: `factura-${orderNumber}.pdf`, content: pdfBuffer });
  }

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [order.email],
    replyTo: REPLY_TO,
    subject: `Pedido ${orderNumber} confirmado \u2713 \u2014 Parra GK Gloves`,
    html,
    ...(attachments.length > 0 ? { attachments } : {}),
  });

  if (error) throw new Error(`[email] Resend error: ${error.message}`);
  console.log(`[email] Confirmación enviada a ${order.email} (id: ${data?.id})`);
  return data;
}

// ── 2. Shipping Update ────────────────────────────────────────────────────────

export interface SendShippingUpdateOptions {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  trackingNumber?: string;
  shippingCompany?: string;
  trackingUrl?: string;
}

function buildShippingHtml(opts: SendShippingUpdateOptions): string {
  const firstName = opts.customerName.split(' ')[0];
  const steps = [
    { label: 'Recibido', done: true, active: false },
    { label: 'Procesando', done: true, active: false },
    { label: 'Enviado', done: false, active: true },
    { label: 'Entregado', done: false, active: false },
  ];

  const stepsHtml = steps.map(s => `
      <td style="text-align:center;width:25%;padding:0 4px;">
        <div style="width:32px;height:32px;border-radius:50%;background-color:${s.done || s.active ? c.gold : '#1a1a1a'};display:inline-block;line-height:32px;text-align:center;margin-bottom:6px;">
          <span style="font-size:14px;color:#000;font-weight:900;">${s.done || s.active ? '&#10003;' : ''}</span>
        </div>
        <p style="margin:0;font-size:11px;color:${s.active ? c.gold : (s.done ? c.muted : c.subtle)};font-weight:${s.active ? '700' : '400'};font-family:${fontStack};">${s.label}</p>
      </td>`).join('');

  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.card};">
      <tr>
        <td style="padding:40px 40px 0;text-align:center;">
          <p style="margin:0 0 12px;font-size:48px;">&#128666;</p>
          <p style="margin:0 0 8px;font-size:26px;font-weight:900;color:${c.white};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">
            &iexcl;Tu pedido est&aacute; <span style="color:${c.gold};">en camino</span>!
          </p>
          <p style="margin:0 0 32px;font-size:15px;color:${c.muted};line-height:1.6;font-family:${fontStack};">
            Hola <strong style="color:${c.white};">${esc(firstName)}</strong>, acabamos de entregar tu pedido al transportista.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border-radius:4px;padding:24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${stepsHtml}</tr></table>
          </div>
        </td>
      </tr>
      ${(opts.trackingNumber || opts.shippingCompany) ? `
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border-left:3px solid ${c.gold};border-radius:4px;padding:20px 24px;">
            <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">INFORMACI&Oacute;N DE SEGUIMIENTO</p>
            ${opts.shippingCompany ? `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
              <tr>
                <td><p style="margin:0;font-size:12px;color:${c.subtle};font-family:${fontStack};">Transportista</p></td>
                <td style="text-align:right;"><p style="margin:0;font-size:14px;font-weight:700;color:${c.white};font-family:${fontStack};">${esc(opts.shippingCompany)}</p></td>
              </tr>
            </table>` : ''}
            ${opts.trackingNumber ? `
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td><p style="margin:0;font-size:12px;color:${c.subtle};font-family:${fontStack};">N&ordm; Seguimiento</p></td>
                <td style="text-align:right;"><p style="margin:0;font-size:14px;font-weight:700;color:${c.goldLight};font-family:${fontStack};">${esc(opts.trackingNumber)}</p></td>
              </tr>
            </table>` : ''}
          </div>
        </td>
      </tr>` : ''}
      <tr>
        <td style="padding:0 40px 40px;text-align:center;">
          <a href="${esc(opts.trackingUrl || 'https://www.parragkgloves.es/profile')}" style="display:inline-block;background-color:${c.gold};color:#000;font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 40px;border-radius:4px;font-family:${fontStack};">${opts.trackingUrl ? 'RASTREAR MI PEDIDO' : 'VER MIS PEDIDOS'} &rarr;</a>
        </td>
      </tr>
    </table>`;

  return layout(`Tu pedido ${opts.orderNumber} est\u00e1 en camino \u2014 Parra GK Gloves`, body);
}

export async function sendShippingUpdate(opts: SendShippingUpdateOptions) {
  await loadBrandColors();
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [opts.customerEmail],
    replyTo: REPLY_TO,
    subject: `\u00a1Tu pedido ${opts.orderNumber} est\u00e1 en camino! \u2014 Parra GK Gloves`,
    html: buildShippingHtml(opts),
  });
  if (error) throw new Error(`[email] Resend error: ${error.message}`);
  console.log(`[email] Env\u00edo notificado a ${opts.customerEmail}`);
  return data;
}

// ── 3. Order Delivered ────────────────────────────────────────────────────────

export interface SendOrderDeliveredOptions {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  reviewUrl?: string;
}

function buildDeliveredHtml(opts: SendOrderDeliveredOptions): string {
  const firstName = opts.customerName.split(' ')[0];

  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.card};">
      <tr>
        <td style="padding:40px 40px 0;text-align:center;">
          <p style="margin:0 0 12px;font-size:48px;">&#128230;</p>
          <p style="margin:0 0 8px;font-size:26px;font-weight:900;color:${c.white};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">
            &iexcl;Pedido <span style="color:${c.gold};">Entregado</span>!
          </p>
          <p style="margin:0 0 32px;font-size:15px;color:${c.muted};line-height:1.6;font-family:${fontStack};">
            Hola <strong style="color:${c.white};">${esc(firstName)}</strong>, tu pedido <strong style="color:${c.white};">${esc(opts.orderNumber)}</strong> ha sido entregado. &iexcl;Esperamos que lo disfrutes!
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border:1px solid ${c.cardBorder};border-radius:4px;padding:24px;text-align:center;">
            <p style="margin:0 0 8px;font-size:28px;letter-spacing:4px;color:${c.gold};">&#9733;&#9733;&#9733;&#9733;&#9733;</p>
            <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:${c.white};font-family:${fontStack};">&iquest;Qu&eacute; te han parecido los guantes?</p>
            <p style="margin:0 0 20px;font-size:14px;color:${c.muted};font-family:${fontStack};">Tu opini&oacute;n nos ayuda a mejorar y a otros porteros a elegir.</p>
            <a href="${esc(opts.reviewUrl || 'https://www.parragkgloves.es/profile?tab=rese%C3%B1as')}" style="display:inline-block;background-color:${c.gold};color:#000;font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:12px 32px;border-radius:4px;font-family:${fontStack};">DEJAR RESE&Ntilde;A &rarr;</a>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 40px;text-align:center;">
          <p style="margin:0 0 16px;font-size:14px;color:${c.muted};font-family:${fontStack};">&iquest;Listo para tu pr&oacute;ximo entrenamiento?</p>
          <a href="https://www.parragkgloves.es/shop" style="display:inline-block;border:1px solid ${c.gold};color:${c.gold};font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:12px 32px;border-radius:4px;font-family:${fontStack};">VER TIENDA</a>
        </td>
      </tr>
    </table>`;

  return layout(`\u00a1Tu pedido ${opts.orderNumber} ha llegado! \u2014 Parra GK Gloves`, body);
}

export async function sendOrderDelivered(opts: SendOrderDeliveredOptions) {
  await loadBrandColors();
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [opts.customerEmail],
    replyTo: REPLY_TO,
    subject: `\u00a1Tu pedido ${opts.orderNumber} ha llegado! \u2014 Parra GK Gloves`,
    html: buildDeliveredHtml(opts),
  });
  if (error) throw new Error(`[email] Resend error: ${error.message}`);
  console.log(`[email] Entrega notificada a ${opts.customerEmail}`);
  return data;
}

// ── 4. Password Reset ─────────────────────────────────────────────────────────

export interface SendPasswordResetOptions {
  customerEmail: string;
  customerName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

function buildPasswordResetHtml(opts: SendPasswordResetOptions): string {
  const firstName = opts.customerName.split(' ')[0];
  const expires = opts.expiresInMinutes ?? 60;

  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.card};">
      <tr>
        <td style="padding:40px 40px 0;text-align:center;">
          <p style="margin:0 0 12px;font-size:48px;">&#128274;</p>
          <p style="margin:0 0 8px;font-size:26px;font-weight:900;color:${c.white};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">
            Restablecer <span style="color:${c.gold};">contrase&ntilde;a</span>
          </p>
          <p style="margin:0 0 32px;font-size:15px;color:${c.muted};line-height:1.6;font-family:${fontStack};">
            Hola <strong style="color:${c.white};">${esc(firstName)}</strong>, recibimos una solicitud para cambiar la contrase&ntilde;a de tu cuenta.<br/>
            Si no la enviaste t&uacute;, ignora este correo.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;text-align:center;">
          <a href="${esc(opts.resetUrl)}" style="display:inline-block;background-color:${c.gold};color:#000;font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 40px;border-radius:4px;font-family:${fontStack};">CAMBIAR CONTRASE&Ntilde;A &rarr;</a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border-left:3px solid #ef4444;border-radius:4px;padding:16px 20px;">
            <p style="margin:0;font-size:13px;color:${c.muted};font-family:${fontStack};">
              &#9888;&nbsp; Este enlace caduca en <strong style="color:${c.white};">${expires} minutos</strong>.
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 40px;text-align:center;">
          <p style="margin:0 0 8px;font-size:12px;color:${c.subtle};font-family:${fontStack};">Si el bot&oacute;n no funciona, copia este enlace en tu navegador:</p>
          <p style="margin:0;font-size:11px;color:${c.muted};word-break:break-all;font-family:${fontStack};">${esc(opts.resetUrl)}</p>
        </td>
      </tr>
    </table>`;

  return layout('Restablece tu contrase\u00f1a en Parra GK Gloves', body);
}

export async function sendPasswordReset(opts: SendPasswordResetOptions) {
  await loadBrandColors();
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [opts.customerEmail],
    replyTo: REPLY_TO,
    subject: 'Restablecer contrase\u00f1a \u2014 Parra GK Gloves',
    html: buildPasswordResetHtml(opts),
  });
  if (error) throw new Error(`[email] Resend error: ${error.message}`);
  console.log(`[email] Password reset enviado a ${opts.customerEmail}`);
  return data;
}

// ── 5. Contact Form ──────────────────────────────────────────────────────────

export interface SendContactFormOptions {
  name: string;
  email: string;
  subject: string;
  message: string;
}

function buildContactFormHtml(opts: SendContactFormOptions): string {
  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.card};">
      <tr>
        <td style="padding:40px 40px 0;text-align:center;">
          <p style="margin:0 0 8px;font-size:26px;font-weight:900;color:${c.white};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">
            Nuevo <span style="color:${c.gold};">Mensaje</span>
          </p>
          <p style="margin:0 0 32px;font-size:15px;color:${c.muted};line-height:1.6;font-family:${fontStack};">
            Has recibido un nuevo mensaje desde el formulario de contacto.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border-left:3px solid ${c.gold};border-radius:4px;padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-bottom:16px;">
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">NOMBRE</p>
                  <p style="margin:0;font-size:14px;color:${c.white};font-family:${fontStack};">${esc(opts.name)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:16px;">
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">EMAIL</p>
                  <p style="margin:0;font-size:14px;color:${c.white};font-family:${fontStack};"><a href="mailto:${esc(opts.email)}" style="color:${c.gold};text-decoration:none;">${esc(opts.email)}</a></p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">ASUNTO</p>
                  <p style="margin:0;font-size:14px;color:${c.white};font-family:${fontStack};">${esc(opts.subject)}</p>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">MENSAJE</p>
          <div style="background-color:#0d0d10;border-radius:4px;padding:20px 24px;">
            <p style="margin:0;font-size:14px;color:${c.muted};line-height:1.8;white-space:pre-wrap;word-break:break-word;font-family:${fontStack};">${esc(opts.message)}</p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 40px;text-align:center;">
          <a href="mailto:${esc(opts.email)}?subject=Re: ${esc(opts.subject)}" style="display:inline-block;background-color:${c.gold};color:#000;font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 40px;border-radius:4px;font-family:${fontStack};">RESPONDER &rarr;</a>
        </td>
      </tr>
    </table>`;

  return layout(`Nuevo mensaje de ${opts.name}`, body);
}

export async function sendContactForm(opts: SendContactFormOptions) {
  await loadBrandColors();
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: ['info@parragkgloves.es'],
    replyTo: opts.email,
    subject: `Nuevo contacto: ${opts.subject}`,
    html: buildContactFormHtml(opts),
  });

  if (error) throw new Error(`[email] Resend error: ${error.message}`);
  console.log(`[email] Contacto recibido de ${opts.email} (asunto: ${opts.subject})`);
  return data;
}

// ── 6. Order Cancellation ──────────────────────────────────────────────────

export interface SendCancellationConfirmationOptions {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  refundAmount: number;
  refundId: string;
}

function buildCancellationConfirmationHtml(opts: SendCancellationConfirmationOptions): string {
  const firstName = opts.customerName.split(' ')[0];

  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.card};">
      <tr>
        <td style="padding:40px 40px 0;text-align:center;">
          <p style="margin:0 0 12px;font-size:48px;">&#9888;</p>
          <p style="margin:0 0 8px;font-size:26px;font-weight:900;color:${c.white};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">
            Pedido <span style="color:${c.gold};">Cancelado</span>
          </p>
          <p style="margin:0 0 32px;font-size:15px;color:${c.muted};line-height:1.6;font-family:${fontStack};">
            Hola <strong style="color:${c.white};">${esc(firstName)}</strong>, tu pedido ha sido cancelado y hemos iniciado el reembolso.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border-left:3px solid ${c.gold};border-radius:4px;padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">N&ordm; DE PEDIDO</p>
                  <p style="margin:0;font-size:14px;color:${c.white};font-family:${fontStack};">${esc(opts.orderNumber)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">ID DE REEMBOLSO</p>
                  <p style="margin:0;font-size:14px;color:${c.goldLight};word-break:break-all;font-family:${fontStack};">${esc(opts.refundId)}</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">CANTIDAD REEMBOLSADA</p>
                  <p style="margin:0;font-size:18px;font-weight:900;color:${c.gold};font-family:${fontStack};">${fmt(opts.refundAmount)}</p>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border-radius:4px;padding:16px 20px;">
            <p style="margin:0;font-size:13px;color:${c.muted};line-height:1.6;font-family:${fontStack};">
              &#128336;&nbsp; El reembolso puede tardar 3-5 d&iacute;as h&aacute;biles en aparecer en tu cuenta, dependiendo de tu banco.
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 40px;text-align:center;">
          <p style="margin:0 0 16px;font-size:14px;color:${c.muted};font-family:${fontStack};">&iquest;Necesitas ayuda?</p>
          <a href="mailto:info@parragkgloves.es" style="display:inline-block;border:1px solid ${c.gold};color:${c.gold};font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:12px 32px;border-radius:4px;font-family:${fontStack};">CONTACTAR SOPORTE</a>
        </td>
      </tr>
    </table>`;

  return layout(`Tu pedido ${opts.orderNumber} ha sido cancelado`, body);
}

export async function sendCancellationConfirmation(opts: SendCancellationConfirmationOptions) {
  await loadBrandColors();
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [opts.customerEmail],
    replyTo: REPLY_TO,
    subject: `Pedido ${opts.orderNumber} cancelado \u2014 Parra GK Gloves`,
    html: buildCancellationConfirmationHtml(opts),
  });

  if (error) throw new Error(`[email] Resend error: ${error.message}`);
  console.log(`[email] Cancelación enviada a ${opts.customerEmail}`);
  return data;
}

// ── 7. Return Approval ─────────────────────────────────────────────────────

export interface SendReturnApprovalConfirmationOptions {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  refundAmount: number;
  refundId: string;
  pdfBuffer?: Buffer;
}

function buildReturnApprovalHtml(opts: SendReturnApprovalConfirmationOptions): string {
  const firstName = opts.customerName.split(' ')[0];
  const now = new Date();
  const invoiceDate = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const invoiceNumber = `DEV-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${opts.refundId.slice(-6).toUpperCase()}`;

  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.card};">
      <tr>
        <td style="padding:40px 40px 24px;text-align:center;">
          <p style="margin:0 0 10px;font-size:44px;">&#10003;</p>
          <p style="margin:0 0 8px;font-size:26px;font-weight:900;color:${c.white};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">
            Devoluci&oacute;n <span style="color:${c.gold};">Aprobada</span>
          </p>
          <p style="margin:0;font-size:14px;color:${c.muted};line-height:1.6;font-family:${fontStack};">
            Hola <strong style="color:${c.white};">${esc(firstName)}</strong>, hemos verificado el artículo y tu reembolso ha sido procesado.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d0d10;border-radius:6px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
            <tr>
              <td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);" colspan="2">
                <p style="margin:0;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:2px;text-transform:uppercase;font-family:${fontStack};">Nota de Abono / Factura de Devolución</p>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.04);width:50%;vertical-align:top;">
                <p style="margin:0 0 2px;font-size:10px;color:${c.subtle};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">Nº Documento</p>
                <p style="margin:0;font-size:12px;color:${c.white};font-family:monospace;">${esc(invoiceNumber)}</p>
              </td>
              <td style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:top;">
                <p style="margin:0 0 2px;font-size:10px;color:${c.subtle};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">Fecha</p>
                <p style="margin:0;font-size:12px;color:${c.white};font-family:${fontStack};">${invoiceDate}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:top;">
                <p style="margin:0 0 2px;font-size:10px;color:${c.subtle};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">Nº Pedido</p>
                <p style="margin:0;font-size:12px;color:${c.white};font-family:${fontStack};">${esc(opts.orderNumber)}</p>
              </td>
              <td style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:top;">
                <p style="margin:0 0 2px;font-size:10px;color:${c.subtle};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">ID Reembolso Stripe</p>
                <p style="margin:0;font-size:11px;color:${c.goldLight};word-break:break-all;font-family:monospace;">${esc(opts.refundId)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.04);" colspan="2">
                <p style="margin:0 0 2px;font-size:10px;color:${c.subtle};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">Concepto</p>
                <p style="margin:0;font-size:12px;color:${c.white};font-family:${fontStack};">Devolución de producto — coste de envío no incluido</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 20px;" colspan="2">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:12px;color:${c.muted};font-family:${fontStack};">Importe a reembolsar (IVA incl.)</td>
                    <td style="text-align:right;font-size:22px;font-weight:900;color:${c.gold};font-family:${fontStack};">${fmt(opts.refundAmount)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 24px;">
          <div style="background-color:#0d0d10;border-radius:4px;padding:14px 18px;border:1px solid rgba(255,255,255,0.05);">
            <p style="margin:0;font-size:12px;color:${c.muted};line-height:1.6;font-family:${fontStack};">&#128336;&nbsp; El importe puede tardar <strong style="color:${c.white};">3–5 días hábiles</strong> en aparecer en tu cuenta, dependiendo de tu banco o método de pago.</p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 40px;text-align:center;">
          <p style="margin:0 0 16px;font-size:14px;color:${c.muted};font-family:${fontStack};">¿Necesitas ayuda?</p>
          <a href="mailto:info@parragkgloves.es" style="display:inline-block;border:1px solid ${c.gold};color:${c.gold};font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:12px 32px;border-radius:4px;font-family:${fontStack};">CONTACTAR SOPORTE</a>
        </td>
      </tr>
    </table>`;

  return layout(`Devolución aprobada — ${opts.orderNumber}`, body);
}

export async function sendReturnApprovalConfirmation(opts: SendReturnApprovalConfirmationOptions) {
  await loadBrandColors();
  const resend = getResend();
  const invoiceNumber = `DEV-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}-${opts.refundId.slice(-6).toUpperCase()}`;
  const attachments: { filename: string; content: Buffer }[] = [];
  if (opts.pdfBuffer) {
    attachments.push({ filename: `nota-abono-${invoiceNumber}.pdf`, content: opts.pdfBuffer });
  }
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [opts.customerEmail],
    replyTo: REPLY_TO,
    subject: `Devolución aprobada — Pedido ${opts.orderNumber} — Parra GK Gloves`,
    html: buildReturnApprovalHtml(opts),
    ...(attachments.length > 0 ? { attachments } : {}),
  });

  if (error) throw new Error(`[email] Resend error: ${error.message}`);
  console.log(`[email] Aprobación de devolución enviada a ${opts.customerEmail}`);
  return data;
}

// ── 8. Return Rejection ────────────────────────────────────────────────────

export interface SendReturnRejectionNotificationOptions {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  reason: string;
}

function buildReturnRejectionHtml(opts: SendReturnRejectionNotificationOptions): string {
  const firstName = opts.customerName.split(' ')[0];

  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.card};">
      <tr>
        <td style="padding:40px 40px 0;text-align:center;">
          <p style="margin:0 0 12px;font-size:48px;">&#10005;</p>
          <p style="margin:0 0 8px;font-size:26px;font-weight:900;color:${c.white};text-transform:uppercase;letter-spacing:1px;font-family:${fontStack};">
            Devoluci&oacute;n <span style="color:#ef4444;">Rechazada</span>
          </p>
          <p style="margin:0 0 32px;font-size:15px;color:${c.muted};line-height:1.6;font-family:${fontStack};">
            Hola <strong style="color:${c.white};">${esc(firstName)}</strong>, lamentablemente tu solicitud de devoluci&oacute;n no ha sido aprobada.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border-left:3px solid #ef4444;border-radius:4px;padding:20px 24px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">RAZON</p>
            <p style="margin:0;font-size:14px;color:${c.muted};line-height:1.6;font-family:${fontStack};">${esc(opts.reason)}</p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;">
          <div style="background-color:#0d0d10;border-radius:4px;padding:16px 20px;">
            <p style="margin:0;font-size:13px;color:${c.muted};line-height:1.6;font-family:${fontStack};">
              Si crees que esto es un error o tienes preguntas, no dudes en ponerte en contacto con nuestro equipo de soporte.
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 40px;text-align:center;">
          <a href="mailto:info@parragkgloves.es" style="display:inline-block;background-color:${c.gold};color:#000;font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 40px;border-radius:4px;font-family:${fontStack};">CONTACTAR SOPORTE &rarr;</a>
        </td>
      </tr>
    </table>`;

  return layout(`Devoluci\u00f3n no aprobada para ${opts.orderNumber}`, body);
}

export async function sendReturnRejectionNotification(opts: SendReturnRejectionNotificationOptions) {
  await loadBrandColors();
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [opts.customerEmail],
    replyTo: REPLY_TO,
    subject: `Devoluci\u00f3n no aprobada \u2014 Pedido ${opts.orderNumber} \u2014 Parra GK Gloves`,
    html: buildReturnRejectionHtml(opts),
  });

  if (error) throw new Error(`[email] Resend error: ${error.message}`);
  console.log(`[email] Rechazo de devolución enviado a ${opts.customerEmail}`);
  return data;
}

// ── 9. Return Request Confirmation ───────────────────────────────────────────

export interface SendReturnRequestConfirmationOptions {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  reason: string;
  returnAddress?: string;
}

function buildReturnRequestHtml(opts: SendReturnRequestConfirmationOptions): string {
  const firstName = opts.customerName.split(' ')[0];

  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.card};">
      <tr>
        <td style="padding:40px 40px 24px;text-align:center;">
          <p style="margin:0 0 12px;font-size:40px;">&#128230;</p>
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:${c.white};letter-spacing:1px;text-transform:uppercase;font-family:${fontStack};">Instrucciones de Devolución</h1>
          <p style="margin:0;font-size:14px;color:${c.muted};font-family:${fontStack};">Hola ${esc(firstName)}, hemos recibido tu solicitud. Sigue estos pasos para enviarnos el producto.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 24px;">
          <div style="background-color:#0d0d10;border-radius:6px;padding:16px 20px;border:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">Pedido</p>
            <p style="margin:0 0 14px;font-size:16px;font-weight:900;color:${c.white};font-family:${fontStack};">${esc(opts.orderNumber)}</p>
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">Motivo indicado</p>
            <p style="margin:0;font-size:13px;color:${c.muted};line-height:1.6;font-family:${fontStack};">${esc(opts.reason)}</p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 24px;">
          <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:${c.white};letter-spacing:0.5px;font-family:${fontStack};">Cómo enviar tu devolución:</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:8px 0;vertical-align:top;width:30px;">
                <div style="width:24px;height:24px;border-radius:50%;background:${c.gold};display:inline-block;text-align:center;line-height:24px;font-size:11px;font-weight:900;color:#000;font-family:${fontStack};">1</div>
              </td>
              <td style="padding:8px 0 8px 10px;vertical-align:top;">
                <p style="margin:0;font-size:13px;color:${c.muted};line-height:1.5;font-family:${fontStack};"><strong style="color:${c.white};">Empaqueta el artículo</strong> — Usa el embalaje original si es posible. El producto debe estar en el mismo estado en que lo recibiste.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;vertical-align:top;width:30px;">
                <div style="width:24px;height:24px;border-radius:50%;background:${c.gold};display:inline-block;text-align:center;line-height:24px;font-size:11px;font-weight:900;color:#000;font-family:${fontStack};">2</div>
              </td>
              <td style="padding:8px 0 8px 10px;vertical-align:top;">
                <p style="margin:0;font-size:13px;color:${c.muted};line-height:1.5;font-family:${fontStack};"><strong style="color:${c.white};">Incluye una nota dentro</strong> — Escribe tu número de pedido <strong style="color:${c.gold};">${esc(opts.orderNumber)}</strong> en un papel dentro del paquete para que podamos identificarlo.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;vertical-align:top;width:30px;">
                <div style="width:24px;height:24px;border-radius:50%;background:${c.gold};display:inline-block;text-align:center;line-height:24px;font-size:11px;font-weight:900;color:#000;font-family:${fontStack};">3</div>
              </td>
              <td style="padding:8px 0 8px 10px;vertical-align:top;">
                <p style="margin:0;font-size:13px;color:${c.muted};line-height:1.5;font-family:${fontStack};"><strong style="color:${c.white};">Envíalo a nuestra dirección</strong> — Usa un servicio con número de seguimiento (correo certificado o mensajería). Los gastos de envío de la devolución corren por tu cuenta.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;vertical-align:top;width:30px;">
                <div style="width:24px;height:24px;border-radius:50%;background:${c.gold};display:inline-block;text-align:center;line-height:24px;font-size:11px;font-weight:900;color:#000;font-family:${fontStack};">4</div>
              </td>
              <td style="padding:8px 0 8px 10px;vertical-align:top;">
                <p style="margin:0;font-size:13px;color:${c.muted};line-height:1.5;font-family:${fontStack};"><strong style="color:${c.white};">Guarda el justificante</strong> — Consérvalo hasta que hayamos procesado tu devolución. Puedes enviarnos el número de seguimiento respondiendo a este email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 24px;">
          <div style="background-color:#0d0d10;border-left:3px solid ${c.gold};border-radius:4px;padding:20px 24px;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:${c.subtle};letter-spacing:1.5px;text-transform:uppercase;font-family:${fontStack};">Dirección de envío</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:${c.white};line-height:1.8;font-family:${fontStack};">${opts.returnAddress ? esc(opts.returnAddress).replace(/\n/g, '<br/>') : 'Consulta por email la dirección de envío'}</p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 24px;">
          <div style="background-color:#0d0d10;border-radius:4px;padding:14px 18px;border:1px solid rgba(255,255,255,0.05);">
            <p style="margin:0;font-size:12px;color:${c.muted};line-height:1.6;font-family:${fontStack};">&#128336;&nbsp; Una vez recibamos y verifiquemos el artículo te enviaremos la resolución. Si es aprobada, el reembolso se acreditará en tu método de pago original en <strong style="color:${c.white};">3–5 días hábiles</strong>.</p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 40px;text-align:center;">
          <p style="margin:0 0 16px;font-size:14px;color:${c.muted};font-family:${fontStack};">¿Tienes alguna pregunta?</p>
          <a href="mailto:info@parragkgloves.es" style="display:inline-block;border:1px solid ${c.gold};color:${c.gold};font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:12px 32px;border-radius:4px;font-family:${fontStack};">CONTACTAR SOPORTE</a>
        </td>
      </tr>
    </table>`;

  return layout(`Instrucciones de devolución — ${opts.orderNumber}`, body);
}

export async function sendReturnRequestConfirmation(opts: SendReturnRequestConfirmationOptions) {
  await loadBrandColors();
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [opts.customerEmail],
    replyTo: REPLY_TO,
    subject: `Solicitud de devolución recibida \u2014 Pedido ${opts.orderNumber} \u2014 Parra GK Gloves`,
    html: buildReturnRequestHtml(opts),
  });

  if (error) throw new Error(`[email] Resend error: ${error.message}`);
  console.log(`[email] Confirmación de solicitud de devolución enviada a ${opts.customerEmail}`);
  return data;
}

// ── Legacy shim ───────────────────────────────────────────────────────────────

export async function sendOrderConfirmationEmail(
  order: SendOrderConfirmationOptions['order'],
  items: SendOrderConfirmationOptions['items'],
  pdfBuffer?: Buffer,
) {
  return sendOrderConfirmation({ order, items, pdfBuffer });
}
