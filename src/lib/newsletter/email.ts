import { Resend } from 'resend';
import { WELCOME_MANAGE_URL } from './constants';

const FROM = 'Parra GK Gloves <info@parragkgloves.es>';
const REPLY_TO = 'soporte@parragkgloves.es';

function getResend(): Resend {
    const key = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
    if (!key) throw new Error('[newsletter] RESEND_API_KEY no está configurada.');
    return new Resend(key);
}

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
    badge?: string;
    code?: string;
}): string {
    const safeTitle   = escapeHtml(options.title);
    const safeMessage = escapeHtml(options.message).replace(/\n/g, '<br />');
    const ctaLabel    = escapeHtml(options.ctaLabel || 'Ver más');
    const ctaUrl      = options.ctaUrl || 'https://www.parragkgloves.es/shop';
    const badge       = options.badge ? escapeHtml(options.badge) : null;
    const code        = options.code  ? escapeHtml(options.code)  : null;

    const codeBlock = code ? `
          <tr>
            <td style="padding:0 36px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#0a0f1a;border:2px dashed #39FF14;border-radius:10px;padding:22px 16px;text-align:center;">
                    <div style="font-size:11px;color:#6b7280;letter-spacing:2px;margin-bottom:10px;text-transform:uppercase;">Tu código de descuento</div>
                    <div style="font-size:34px;font-weight:900;letter-spacing:10px;color:#39FF14;font-family:'Courier New',Courier,monospace;">${code}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:10px;">Cópialo y úsalo al finalizar tu compra</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : '';

    const badgeBlock = badge ? `<div style="margin-bottom:18px;"><span style="background:#39FF14;color:#000000;font-size:10px;font-weight:900;letter-spacing:2px;padding:5px 12px;border-radius:3px;text-transform:uppercase;">${badge}</span></div>` : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#06070a;font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#06070a" style="padding:36px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#000000;padding:28px 36px;border-radius:12px 12px 0 0;border-bottom:3px solid #39FF14;text-align:center;">
              <div style="font-size:30px;font-weight:900;letter-spacing:6px;color:#ffffff;line-height:1;">PARRA</div>
              <div style="font-size:10px;letter-spacing:4px;color:#39FF14;margin-top:6px;font-weight:700;">GOALKEEPER GLOVES</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#0d1018;border:1px solid #1e2533;border-top:none;border-radius:0 0 12px 12px;padding:36px 36px 0;">
              ${badgeBlock}
              <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;line-height:1.35;color:#ffffff;">${safeTitle}</h1>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.75;color:#9aa3b2;">${safeMessage}</p>
            </td>
          </tr>

          <!-- Coupon code (optional) -->${codeBlock}

          <!-- CTA -->
          <tr>
            <td style="background:#0d1018;border:1px solid #1e2533;border-top:none;padding:0 36px 32px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:6px;">
                    <a href="${ctaUrl}" style="display:inline-block;background:#39FF14;color:#000000;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:1px;padding:14px 30px;border-radius:6px;">${ctaLabel} &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0d1018;border:1px solid #1e2533;border-top:1px solid #1e2533;border-radius:0 0 12px 12px;padding:20px 36px;margin-top:0;">
              <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
                Recibes este correo porque estás suscrito al <strong style="color:#6b7280;">Club Parra GK Gloves</strong>.<br />
                <a href="https://www.parragkgloves.es/profile" style="color:#6b7280;text-decoration:underline;">Gestionar suscripción</a>
              </p>
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
    const resend = getResend();

    const { data, error } = await resend.emails.send({
        from: FROM,
        to: options.to,
        replyTo: REPLY_TO,
        subject: options.subject,
        html: options.html,
        text: options.text,
    });

    if (error) {
        throw new Error(`[newsletter] Resend error: ${error.message}`);
    }

    return data?.id || null;
}
