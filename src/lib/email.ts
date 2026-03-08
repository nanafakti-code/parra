import nodemailer from 'nodemailer';

// Helper to format currency
const fmt = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";

// Helper to get initials
const getInitials = (name: string) => {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
}

/**
 * Creates the Nodemailer transporter instance based on environment variables.
 */
function createTransporter() {
    // Configuración SMTP para info@parragkgloves.es en Hostalia
    const host = import.meta.env.SMTP_HOST || process.env.SMTP_HOST || 'smtp.hostalia.com';
    const port = Number(import.meta.env.SMTP_PORT || process.env.SMTP_PORT || 587);
    const secure = (import.meta.env.SMTP_SECURE || process.env.SMTP_SECURE) === 'true'; // false para puerto 587
    const user = import.meta.env.SMTP_USER || process.env.SMTP_USER || 'info@parragkgloves.es';
    const pass = import.meta.env.SMTP_PASS || process.env.SMTP_PASS;

    if (!pass) {
        console.warn('[email] SMTP_PASS no está configurada. Los emails no se enviarán.');
    }

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user,
            pass,
        },
    });
}

/**
 * Plantilla HTML para la confirmación de pedido con diseño estilo "Parra" (oscuro, neón, minimalista).
 */
function getOrderConfirmationHtml(order: any, items: any[], userProfile?: any): string {
    const orderNumber = order.order_number || `EG-${String(order.id).slice(-8).toUpperCase()}`;
    const customerName = order.shipping_name || userProfile?.full_name || 'Cliente';
    const address = [order.shipping_street, order.shipping_city, order.shipping_postal_code, order.shipping_country || "España"].filter(Boolean).join(", ");

    const itemsHtml = items.map((item: any) => {
        const imgUrl = item.product_image || 'https://via.placeholder.com/80x80/202020/ffffff?text=PARRA';
        const itemPrice = parseFloat(item.unit_price) || 0;
        const itemQty = Number(item.quantity) || 1;
        const itemSubtotal = itemPrice * itemQty;

        return `
            <tr>
                <td style="padding: 16px 0; border-bottom: 1px solid #1E2433; display: flex; align-items: center; gap: 16px;">
                    <img src="${imgUrl}" alt="${item.product_name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #1E2433;" />
                    <div style="flex-grow: 1;">
                        <h4 style="margin: 0; font-size: 14px; font-weight: 600; color: #FFFFFF;">${item.product_name}</h4>
                        ${item.size ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #9CA3AF;">Talla: <span style="color: #39FF14;">${item.size}</span></p>` : ''}
                        <p style="margin: 4px 0 0 0; font-size: 12px; color: #9CA3AF;">Cant: ${itemQty}</p>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-weight: 600; color: #FFFFFF; font-size: 14px;">${fmt(itemSubtotal)}</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const subtotal = parseFloat(order.subtotal) || 0;
    const shipping = parseFloat(order.shipping_cost) || 0;
    const total = parseFloat(order.total) || 0;

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirmación de Pedido - Parra GK Gloves</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            body { 
                margin: 0; 
                padding: 0; 
                background-color: #07090D; 
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: #F0F4F8;
                -webkit-font-smoothing: antialiased;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #0D0F14;
            }
            .header {
                padding: 40px 30px;
                text-align: center;
                border-bottom: 2px solid #39FF14;
                background-color: #000000;
            }
            .logo {
                font-size: 32px;
                font-weight: 700;
                color: #FFFFFF;
                letter-spacing: 2px;
                margin: 0;
                text-transform: uppercase;
            }
            .content {
                padding: 40px 30px;
            }
            h1 {
                font-size: 24px;
                font-weight: 600;
                margin-top: 0;
                margin-bottom: 8px;
                color: #FFFFFF;
            }
            p {
                font-size: 15px;
                line-height: 1.6;
                color: #D1D5DB;
                margin-top: 0;
                margin-bottom: 24px;
            }
            .order-meta {
                background-color: #111520;
                border-left: 3px solid #39FF14;
                padding: 20px;
                border-radius: 4px;
                margin-bottom: 32px;
            }
            .order-meta-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            }
            .meta-item {
                font-size: 13px;
            }
            .meta-label {
                color: #9CA3AF;
                margin-bottom: 4px;
                font-weight: 500;
            }
            .meta-value {
                color: #FFFFFF;
                font-weight: 600;
                font-size: 15px;
            }
            .section-title {
                font-size: 12px;
                font-weight: 700;
                color: #39FF14;
                letter-spacing: 1.5px;
                text-transform: uppercase;
                margin-bottom: 16px;
                border-bottom: 1px dashed #1E2433;
                padding-bottom: 8px;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            .totals {
                margin-top: 32px;
                padding-top: 24px;
                border-top: 2px solid #1E2433;
            }
            .total-row {
                display: flex;
                justify-content: space-between;
                font-size: 14px;
                color: #9CA3AF;
                margin-bottom: 12px;
            }
            .total-final {
                display: flex;
                justify-content: space-between;
                font-size: 18px;
                font-weight: 700;
                color: #39FF14;
                margin-top: 16px;
                padding-top: 16px;
                border-top: 1px solid #1E2433;
            }
            .shipping-info {
                margin-top: 32px;
                background-color: #111520;
                padding: 24px;
                border-radius: 4px;
            }
            .shipping-info p {
                margin-bottom: 4px;
                font-size: 14px;
            }
            .footer {
                padding: 30px;
                text-align: center;
                background-color: #000000;
                border-top: 1px solid #1E2433;
            }
            .footer p {
                font-size: 12px;
                color: #6B7280;
                margin-bottom: 8px;
            }
            .socials a {
                color: #39FF14;
                text-decoration: none;
                margin: 0 8px;
                font-size: 12px;
                font-weight: 600;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 class="logo">PARRA</h1>
                <p style="color: #39FF14; font-size: 11px; letter-spacing: 2px; margin: 4px 0 0 0; font-weight: 600;">GOALKEEPER GLOVES</p>
            </div>
            
            <div class="content">
                <h1>¡Gracias por tu compra, ${customerName.split(' ')[0]}!</h1>
                <p>Hemos recibido tu pedido y estamos preparándolo para el envío. Adjunto a este correo encontrarás la factura oficial de tu compra en formato PDF.</p>
                
                <div class="order-meta">
                    <table style="width: 100%;">
                        <tr>
                            <td style="width: 50%; padding-bottom: 16px;">
                                <div class="meta-label">NÚMERO DE PEDIDO</div>
                                <div class="meta-value">${orderNumber}</div>
                            </td>
                            <td style="width: 50%; padding-bottom: 16px;">
                                <div class="meta-label">FECHA</div>
                                <div class="meta-value">${new Date().toLocaleDateString('es-ES')}</div>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <div class="meta-label">ESTADO</div>
                                <div class="meta-value" style="color: #39FF14;">Recibido</div>
                            </td>
                        </tr>
                    </table>
                </div>

                <div class="section-title">// RESUMEN DEL PEDIDO</div>
                <table>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
                
                <div class="totals">
                    <div class="total-row">
                        <span>Subtotal</span>
                        <span style="color: #FFFFFF;">${fmt(subtotal)}</span>
                    </div>
                    <div class="total-row">
                        <span>Envío</span>
                        <span style="color: #FFFFFF;">${shipping === 0 ? 'Gratis' : fmt(shipping)}</span>
                    </div>
                    <div class="total-final">
                        <span>TOTAL</span>
                        <span>${fmt(total)}</span>
                    </div>
                </div>

                <div class="shipping-info">
                    <div class="section-title" style="border: none; margin-bottom: 12px;">// DIRECCIÓN DE ENVÍO</div>
                    <p style="color: #FFFFFF; font-weight: 600;">${customerName}</p>
                    <p>${address}</p>
                    ${order.shipping_phone ? `<p>${order.shipping_phone}</p>` : ''}
                </div>
                
                <p style="margin-top: 32px; font-size: 14px; text-align: center;">
                    Si tienes alguna duda sobre tu pedido, responde a este correo o contáctanos a <a href="mailto:info@parragkgloves.es" style="color: #39FF14; text-decoration: none;">info@parragkgloves.es</a>.
                </p>
            </div>
            
            <div class="footer">
                <p> PARRA Sport S.L. Todos los derechos reservados.</p>
                <div class="socials">
                    <a href="#">INSTAGRAM</a>
                    <a href="#">TIKTOK</a>
                    <a href="#">WEB</a>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

/**
 * Sends the order confirmation email with the invoice attached.
 * 
 * @param order El objeto order de la base de datos
 * @param items Array de order_items con detalles de producto
 * @param pdfBuffer El Buffer del PDF de la factura generado
 * @param userProfile Opcional, el perfil del usuario para nombres
 */
export async function sendOrderConfirmationEmail(
    order: any,
    items: any[],
    pdfBuffer: Buffer,
    userProfile?: any
): Promise<boolean> {
    const toEmail = order.email || userProfile?.email;

    if (!toEmail) {
        console.warn(`[email] No se puede enviar correo para pedido ${order.id}: no hay email válido.`);
        return false;
    }

    const orderNumber = order.order_number || `EG-${String(order.id).slice(-8).toUpperCase()}`;

    try {
        const transporter = createTransporter();
        const html = getOrderConfirmationHtml(order, items, userProfile);

        // Envío del correo usando nodemailer
        const info = await transporter.sendMail({
            from: '"Parra GK Gloves" <info@parragkgloves.es>',
            to: toEmail,
            subject: `Confirmación de compra – Parra GK Gloves (${orderNumber})`,
            html: html,
            attachments: [
                {
                    filename: `factura-${orderNumber}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                }
            ]
        });

        console.log(`[email] Email de confirmación enviado a ${toEmail}: ${info.messageId}`);
        return true;
    } catch (error: any) {
        console.error(`[email] Error al enviar email a ${toEmail}:`, error.message || error);
        return false;
    }
}
