import { createTransporter } from '../email';
import { WELCOME_MANAGE_URL } from './constants';

const FROM = '"Parra GK Gloves" <info@parragkgloves.es>';
const REPLY_TO = 'soporte@parragkgloves.es';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildWelcomeEmailHtml(email: string): string {
    const safeEmail = escapeHtml(email);

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido al Club Parra</title>
</head>
<body style="margin:0;padding:0;background:#06070a;font-family:Arial,Helvetica,sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:24px;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background:#0d1018;border:1px solid #1f2937;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#000;padding:28px 32px;border-bottom:2px solid #39FF14;text-align:center;">
              <div style="font-size:32px;font-weight:900;letter-spacing:4px;">PARRA</div>
              <div style="font-size:11px;letter-spacing:3px;color:#39FF14;margin-top:4px;">GOALKEEPER GLOVES</div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 32px;">
              <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;">Bienvenido al Club Parra GK Gloves</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c9ced8;">
                Gracias por suscribirte con <strong style="color:#ffffff;">${safeEmail}</strong>.
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c9ced8;">
                Recibirás lanzamientos de nuevos productos, reposiciones de stock, cupones exclusivos y campañas especiales antes que nadie.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#c9ced8;">
                Puedes gestionar o cancelar tu suscripción en cualquier momento desde tu perfil.
              </p>
              <a href="${WELCOME_MANAGE_URL}" style="display:inline-block;background:#39FF14;color:#000;text-decoration:none;font-weight:800;letter-spacing:1px;padding:12px 22px;border-radius:4px;">
                Gestionar suscripción
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildBroadcastEmailHtml(options: {
    title: string;
    message: string;
    ctaLabel?: string;
    ctaUrl?: string;
}): string {
    const safeTitle = escapeHtml(options.title);
    const safeMessage = escapeHtml(options.message).replace(/\n/g, '<br />');
    const ctaLabel = escapeHtml(options.ctaLabel || 'Ver más');
    const ctaUrl = options.ctaUrl || 'https://www.parragkgloves.es/shop';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#07090f;font-family:Arial,Helvetica,sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:24px;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background:#0d1018;border:1px solid #1f2937;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:26px 30px;border-bottom:1px solid #1f2937;background:#000;">
              <span style="font-size:11px;color:#39FF14;letter-spacing:2px;font-weight:700;">CLUB PARRA</span>
              <h2 style="margin:10px 0 0;font-size:24px;line-height:1.3;">${safeTitle}</h2>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 30px;">
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#c9ced8;">${safeMessage}</p>
              <a href="${ctaUrl}" style="display:inline-block;background:#39FF14;color:#000;text-decoration:none;font-weight:800;letter-spacing:1px;padding:12px 20px;border-radius:4px;">
                ${ctaLabel}
              </a>
              <p style="margin:20px 0 0;font-size:12px;color:#7b8190;">Gestiona tu suscripción en https://www.parragkgloves.es/profile</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendNewsletterEmail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
}): Promise<string | null> {
  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: FROM,
    to: options.to,
    replyTo: REPLY_TO,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  return info.messageId || null;
}
