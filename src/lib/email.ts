import nodemailer from 'nodemailer';
import { constants as cryptoConstants } from 'crypto';

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const fmt = (n: number) =>
    n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' â‚¬';

// â”€â”€ Transporter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Crea el transporter de Nodemailer para smtp.hostalia.com.
 * Hostalia usa TLS/protocolos legacy que OpenSSL 3.x bloquea por defecto;
 * los ajustes tls los desbloquean sin comprometer el resto de la aplicaciÃ³n.
 */
function createTransporter() {
    const host = import.meta.env.SMTP_HOST || process.env.SMTP_HOST || 'smtp.hostalia.com';
    const port = Number(import.meta.env.SMTP_PORT || process.env.SMTP_PORT || 587);
    const secure = (import.meta.env.SMTP_SECURE || process.env.SMTP_SECURE) === 'true';
    const user = import.meta.env.SMTP_USER || process.env.SMTP_USER || 'info@parragkgloves.es';
    const pass = import.meta.env.SMTP_PASS || process.env.SMTP_PASS;

    if (!pass) {
        console.warn('[email] SMTP_PASS no estÃ¡ configurada. Los emails no se enviarÃ¡n.');
    }

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1' as import('tls').SecureVersion,
            ciphers: 'DEFAULT@SECLEVEL=0',
            secureOptions:
                (cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT ?? 0) |
                (cryptoConstants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION ?? 0),
        },
    });
}

// â”€â”€ HTML Template â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Genera el HTML del email de confirmaciÃ³n de pedido.
 * Todos los estilos son INLINE para mÃ¡xima compatibilidad con clientes de correo
 * (Gmail, Outlook, Apple Mail, etc.).
 */
function getOrderConfirmationHtml(order: any, items: any[], userProfile?: any): string {
    const orderNumber = order.order_number || `PG-${String(order.id).slice(-8).toUpperCase()}`;
    const firstName = (order.shipping_name || userProfile?.full_name || 'Cliente').split(' ')[0];
    const fullName = order.shipping_name || userProfile?.full_name || 'Cliente';
    const orderDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

    const address = [
        order.shipping_street,
        order.shipping_city,
        order.shipping_postal_code,
        order.shipping_country || 'EspaÃ±a',
    ]
        .filter(Boolean)
        .join(', ');

    // â”€â”€ Products rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const itemsRows = items
        .map((item: any) => {
            const imgUrl =
                item.product_image ||
                'https://placehold.co/80x80/111/fff?text=PARRA';
            const unitPrice = parseFloat(item.unit_price) || 0;
            const qty = Number(item.quantity) || 1;
            const subtotalItem = unitPrice * qty;

            return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #222;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="80" valign="top">
                  <img src="${imgUrl}" alt="${item.product_name}"
                    width="72" height="72"
                    style="display:block;width:72px;height:72px;object-fit:cover;border-radius:4px;border:1px solid #222;" />
                </td>
                <td style="padding-left:16px;" valign="middle">
                  <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${item.product_name}</p>
                  ${item.size ? `<p style="margin:0 0 4px 0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">Talla: <span style="color:#39FF14;font-weight:600;">${item.size}</span></p>` : ''}
                  <p style="margin:0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">Cantidad: ${qty} Ã— ${fmt(unitPrice)}</p>
                </td>
                <td width="90" valign="middle" align="right">
                  <p style="margin:0;font-size:15px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${fmt(subtotalItem)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
        })
        .join('');

    // â”€â”€ Totals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const subtotal = parseFloat(order.subtotal) || 0;
    const shippingCost = parseFloat(order.shipping_cost) || 0;
    const total = parseFloat(order.total) || subtotal + shippingCost;

    return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>ConfirmaciÃ³n de pedido â€“ Parra GK Gloves</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Pedido ${orderNumber} confirmado Â· Gracias por confiar en Parra GK Gloves.&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;width:100%;background-color:#111114;border-radius:8px;border:1px solid #1f1f1f;overflow:hidden;">

          <!-- â”€â”€â”€ HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
          <tr>
            <td align="center"
              style="background-color:#000000;padding:36px 40px 28px;border-bottom:3px solid #39FF14;">
              <p style="margin:0;font-size:36px;font-weight:900;color:#ffffff;letter-spacing:6px;text-transform:uppercase;font-family:Arial,sans-serif;">PARRA</p>
              <p style="margin:6px 0 0;font-size:10px;font-weight:700;color:#39FF14;letter-spacing:4px;text-transform:uppercase;font-family:Arial,sans-serif;">GOALKEEPER GLOVES</p>
            </td>
          </tr>

          <!-- â”€â”€â”€ HERO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
          <tr>
            <td align="center" style="padding:40px 40px 0;background-color:#111114;">
              <!-- Checkmark icon -->
              <div style="width:64px;height:64px;background-color:#39FF14;border-radius:50%;margin:0 auto 24px;display:inline-block;text-align:center;line-height:64px;">
                <span style="font-size:30px;color:#000000;font-weight:900;vertical-align:middle;">âœ“</span>
              </div>
              <h1 style="margin:0 0 12px;font-size:26px;font-weight:900;color:#ffffff;text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;">
                Â¡Pedido <span style="color:#39FF14;">Confirmado</span>!
              </h1>
              <p style="margin:0 0 32px;font-size:15px;color:#9ca3af;line-height:1.6;font-family:Arial,sans-serif;">
                Hola <strong style="color:#ffffff;">${firstName}</strong>, hemos recibido tu pedido y lo estamos preparando.<br />
                EncontrarÃ¡s la factura adjunta a este correo en formato PDF.
              </p>
            </td>
          </tr>

          <!-- â”€â”€â”€ ORDER META â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
          <tr>
            <td style="padding:0 40px 32px;background-color:#111114;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background-color:#0d0d10;border-left:3px solid #39FF14;border-radius:4px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="50%" style="padding-bottom:12px;" valign="top">
                          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;font-family:Arial,sans-serif;">NÂº DE PEDIDO</p>
                          <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${orderNumber}</p>
                        </td>
                        <td width="50%" style="padding-bottom:12px;" valign="top">
                          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;font-family:Arial,sans-serif;">FECHA</p>
                          <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${orderDate}</p>
                        </td>
                      </tr>
                      <tr>
                        <td valign="top">
                          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;font-family:Arial,sans-serif;">ESTADO</p>
                          <p style="margin:0;font-size:14px;font-weight:700;color:#39FF14;font-family:Arial,sans-serif;">â— Pedido recibido</p>
                        </td>
                        <td valign="top">
                          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;font-family:Arial,sans-serif;">EMAIL</p>
                          <p style="margin:0;font-size:13px;font-weight:600;color:#ffffff;font-family:Arial,sans-serif;">${order.email || ''}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- â”€â”€â”€ PRODUCTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
          <tr>
            <td style="padding:0 40px;background-color:#111114;">
              <p style="margin:0 0 16px;font-size:10px;font-weight:700;color:#39FF14;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;border-bottom:1px dashed #1f1f1f;padding-bottom:10px;">
                // PRODUCTOS
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tbody>
                  ${itemsRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- â”€â”€â”€ TOTALS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
          <tr>
            <td style="padding:24px 40px 32px;background-color:#111114;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom:10px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:13px;color:#9ca3af;font-family:Arial,sans-serif;">Subtotal</td>
                        <td align="right" style="font-size:13px;color:#ffffff;font-family:Arial,sans-serif;">${fmt(subtotal)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:10px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:13px;color:#9ca3af;font-family:Arial,sans-serif;">Env\u00EDo</td>
                        <td align="right" style="font-size:13px;color:#ffffff;font-family:Arial,sans-serif;">${shippingCost === 0 ? '<span style="color:#39FF14;">Gratis</span>' : fmt(shippingCost)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="border-top:2px solid #1f1f1f;padding-top:14px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:16px;font-weight:900;color:#ffffff;text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;">TOTAL</td>
                        <td align="right" style="font-size:20px;font-weight:900;color:#39FF14;font-family:Arial,sans-serif;">${fmt(total)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- â”€â”€â”€ SHIPPING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
          <tr>
            <td style="padding:0 40px 40px;background-color:#111114;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background-color:#0d0d10;border-radius:4px;padding:20px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:10px;font-weight:700;color:#39FF14;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">// DIRECCIÃ“N DE ENVÃO</p>
                    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${fullName}</p>
                    <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;font-family:Arial,sans-serif;">${address}</p>
                    ${order.shipping_phone ? `<p style="margin:0;font-size:13px;color:#9ca3af;font-family:Arial,sans-serif;">${order.shipping_phone}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- â”€â”€â”€ CTA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
          <tr>
            <td align="center" style="padding:0 40px 40px;background-color:#111114;">
              <a href="https://www.parragkgloves.es/profile"
                style="display:inline-block;background-color:#39FF14;color:#000000;font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:16px 40px;border-radius:2px;font-family:Arial,sans-serif;">
                VER MIS PEDIDOS â†’
              </a>
            </td>
          </tr>

          <!-- â”€â”€â”€ DIVIDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #1f1f1f;margin:0;" />
            </td>
          </tr>

          <!-- â”€â”€â”€ HELP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
          <tr>
            <td align="center" style="padding:28px 40px;background-color:#111114;">
              <p style="margin:0;font-size:13px;color:#6b7280;font-family:Arial,sans-serif;">
                Â¿Tienes alguna duda? Responde a este correo o escrÃ­benos a
                <a href="mailto:info@parragkgloves.es" style="color:#39FF14;text-decoration:none;font-weight:700;">info@parragkgloves.es</a>
              </p>
            </td>
          </tr>

          <!-- â”€â”€â”€ FOOTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
          <tr>
            <td align="center"
              style="background-color:#000000;padding:28px 40px;border-top:1px solid #1f1f1f;">
              <p style="margin:0 0 12px;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:4px;font-family:Arial,sans-serif;">PARRA</p>
              <p style="margin:0 0 16px;font-size:11px;color:#6b7280;font-family:Arial,sans-serif;">
                Â© ${new Date().getFullYear()} Parra GK Gloves. Todos los derechos reservados.
              </p>
              <table cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td style="padding:0 8px;">
                    <a href="https://www.instagram.com/parragkgloves" style="font-size:11px;font-weight:700;color:#39FF14;text-decoration:none;letter-spacing:1px;font-family:Arial,sans-serif;">INSTAGRAM</a>
                  </td>
                  <td style="padding:0 8px;color:#333;font-size:11px;">|</td>
                  <td style="padding:0 8px;">
                    <a href="https://www.tiktok.com/@parragkgloves" style="font-size:11px;font-weight:700;color:#39FF14;text-decoration:none;letter-spacing:1px;font-family:Arial,sans-serif;">TIKTOK</a>
                  </td>
                  <td style="padding:0 8px;color:#333;font-size:11px;">|</td>
                  <td style="padding:0 8px;">
                    <a href="https://www.parragkgloves.es" style="font-size:11px;font-weight:700;color:#39FF14;text-decoration:none;letter-spacing:1px;font-family:Arial,sans-serif;">WEB</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
  <!-- /Wrapper -->

</body>
</html>`;
}

// â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * EnvÃ­a el email de confirmaciÃ³n de pedido con la factura adjunta en PDF.
 *
 * @param order        Objeto order de Supabase
 * @param items        Array de order_items
 * @param pdfBuffer    Buffer del PDF de la factura
 * @param userProfile  Opcional: perfil del usuario (para nombre si falta en order)
 * @returns            true si el email se enviÃ³ correctamente
 */
export async function sendOrderConfirmationEmail(
    order: any,
    items: any[],
    pdfBuffer: Buffer,
    userProfile?: any,
): Promise<boolean> {
    const toEmail = order.email || userProfile?.email;

    if (!toEmail) {
        console.warn(`[email] Pedido ${order.id}: no hay email destinatario.`);
        return false;
    }

    const orderNumber = order.order_number || `PG-${String(order.id).slice(-8).toUpperCase()}`;

    try {
        const transporter = createTransporter();
        const html = getOrderConfirmationHtml(order, items, userProfile);

        const info = await transporter.sendMail({
            from: '"Parra GK Gloves" <info@parragkgloves.es>',
            to: toEmail,
            subject: `âœ… Pedido confirmado ${orderNumber} â€“ Parra GK Gloves`,
            html,
            attachments: [
                {
                    filename: `factura-${orderNumber}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                },
            ],
        });

        console.log(`[email] Enviado a ${toEmail} | messageId: ${info.messageId}`);
        return true;
    } catch (error: any) {
        console.error(`[email] Error enviando a ${toEmail}:`, error.message || error);
        return false;
    }
}


