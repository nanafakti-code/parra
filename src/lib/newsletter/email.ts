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

// ─── Shared partials ──────────────────────────────────────────────────────────

const emailHeader = `
  <!-- Top thin accent line -->
  <tr>
    <td height="2" style="background:linear-gradient(90deg,#000,#39FF14 40%,#39FF14 60%,#000);font-size:0;line-height:0;">&nbsp;</td>
  </tr>
  <!-- Logo -->
  <tr>
    <td style="background:#000000;padding:32px 40px 28px;text-align:center;">
      <div style="font-size:11px;color:#39FF14;letter-spacing:6px;font-weight:700;text-transform:uppercase;margin-bottom:12px;">&#9632;&nbsp;&nbsp;Club Newsletter&nbsp;&nbsp;&#9632;</div>
      <div style="font-size:42px;font-weight:900;letter-spacing:14px;color:#ffffff;line-height:1;text-transform:uppercase;">PARRA</div>
      <div style="font-size:9px;letter-spacing:8px;color:#4a5568;margin-top:8px;font-weight:600;text-transform:uppercase;">Goalkeeper&nbsp;&nbsp;Gloves</div>
    </td>
  </tr>
  <!-- Bottom header divider -->
  <tr>
    <td height="1" style="background:linear-gradient(90deg,#000,#1e2533 30%,#1e2533 70%,#000);font-size:0;line-height:0;">&nbsp;</td>
  </tr>`;

const emailFooter = `
  <!-- Divider -->
  <tr>
    <td height="1" style="background:linear-gradient(90deg,#000,#1e2533 30%,#1e2533 70%,#000);font-size:0;line-height:0;">&nbsp;</td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="background:#000000;padding:22px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:10px;color:#2a3040;letter-spacing:3px;text-transform:uppercase;font-weight:600;">Parra GK Gloves &nbsp;·&nbsp; Club Newsletter</p>
      <p style="margin:0;font-size:11px;color:#2a3040;line-height:1.8;">
        <a href="https://www.parragkgloves.es/profile" style="color:#3a4558;text-decoration:none;border-bottom:1px solid #2a3040;">Gestionar suscripción</a>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <a href="https://www.parragkgloves.es" style="color:#3a4558;text-decoration:none;border-bottom:1px solid #2a3040;">parragkgloves.es</a>
      </p>
    </td>
  </tr>
  <!-- Bottom accent line -->
  <tr>
    <td height="2" style="background:linear-gradient(90deg,#000,#39FF14 40%,#39FF14 60%,#000);font-size:0;line-height:0;">&nbsp;</td>
  </tr>`;

// ─── Welcome email ─────────────────────────────────────────────────────────────

export function buildWelcomeEmailHtml(email: string): string {
    const safeEmail = escapeHtml(email);

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido al Club Parra</title>
</head>
<body style="margin:0;padding:0;background:#05060a;font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#05060a" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;border:1px solid #111827;">
          ${emailHeader}

          <!-- Badge -->
          <tr>
            <td style="background:#060810;padding:28px 40px 0;">
              <span style="display:inline-block;border:1px solid #39FF14;color:#39FF14;font-size:9px;font-weight:700;letter-spacing:4px;padding:5px 14px;text-transform:uppercase;">Acceso confirmado</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#060810;padding:20px 40px 32px;">
              <h1 style="margin:0 0 20px;font-size:28px;font-weight:900;line-height:1.2;color:#ffffff;letter-spacing:-0.5px;">Bienvenido al<br />Club Parra GK Gloves</h1>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.8;color:#6b7280;">
                Te has suscrito con <strong style="color:#c9ced8;">${safeEmail}</strong>.<br />
                A partir de ahora serás el primero en saber:
              </p>

              <!-- Benefits list -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td style="padding:10px 0;border-top:1px solid #111827;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color:#39FF14;font-size:12px;font-weight:700;padding-right:14px;vertical-align:top;padding-top:1px;">01</td>
                        <td style="font-size:13px;color:#9aa3b2;line-height:1.5;">Lanzamientos de nuevos productos</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-top:1px solid #111827;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color:#39FF14;font-size:12px;font-weight:700;padding-right:14px;vertical-align:top;padding-top:1px;">02</td>
                        <td style="font-size:13px;color:#9aa3b2;line-height:1.5;">Cupones exclusivos y bajadas de precio</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-top:1px solid #111827;border-bottom:1px solid #111827;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color:#39FF14;font-size:12px;font-weight:700;padding-right:14px;vertical-align:top;padding-top:1px;">03</td>
                        <td style="font-size:13px;color:#9aa3b2;line-height:1.5;">Reposiciones de stock y campañas especiales</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#39FF14;">
                    <a href="${WELCOME_MANAGE_URL}" style="display:inline-block;background:#39FF14;color:#000000;text-decoration:none;font-weight:900;font-size:12px;letter-spacing:2px;padding:14px 30px;text-transform:uppercase;">Gestionar suscripción &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${emailFooter}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Broadcast email ───────────────────────────────────────────────────────────

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

    const badgeRow = badge ? `
          <tr>
            <td style="background:#060810;padding:28px 40px 0;">
              <span style="display:inline-block;border:1px solid #39FF14;color:#39FF14;font-size:9px;font-weight:700;letter-spacing:4px;padding:5px 14px;text-transform:uppercase;">${badge}</span>
            </td>
          </tr>` : '';

    const codeRow = code ? `
          <tr>
            <td style="background:#060810;padding:0 40px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#000000;border:1px solid #39FF14;padding:26px 16px;text-align:center;box-shadow:0 0 30px rgba(57,255,20,0.12);">
                    <div style="font-size:9px;color:#39FF14;letter-spacing:5px;margin-bottom:16px;text-transform:uppercase;font-weight:700;">&#47;&#47;&nbsp;Código de descuento&nbsp;&#47;&#47;</div>
                    <div style="font-size:40px;font-weight:900;letter-spacing:10px;color:#39FF14;font-family:'Courier New',Courier,monospace;text-shadow:0 0 24px rgba(57,255,20,0.6);">${code}</div>
                    <div style="margin:16px auto 0;height:1px;max-width:200px;background:linear-gradient(90deg,transparent,rgba(57,255,20,0.5),transparent);"></div>
                    <div style="font-size:11px;color:#3a4558;margin-top:14px;letter-spacing:2px;text-transform:uppercase;">Úsalo en el checkout</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : '';

    const ctaPaddingTop = code ? '0' : '0';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#05060a;font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#05060a" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;border:1px solid #111827;">
          ${emailHeader}
          ${badgeRow}

          <!-- Title + message -->
          <tr>
            <td style="background:#060810;padding:${badge ? '20px' : '28px'} 40px 28px;">
              <h1 style="margin:0 0 18px;font-size:26px;font-weight:900;line-height:1.25;color:#ffffff;letter-spacing:-0.5px;">${safeTitle}</h1>
              <p style="margin:0;font-size:14px;line-height:1.85;color:#6b7280;">${safeMessage}</p>
            </td>
          </tr>

          <!-- Separator -->
          <tr>
            <td style="background:#060810;padding:0 40px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,#1a2030,transparent);"></div>
            </td>
          </tr>

          ${codeRow}

          <!-- CTA -->
          <tr>
            <td style="background:#060810;padding:28px 40px 36px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#39FF14;">
                    <a href="${ctaUrl}" style="display:inline-block;background:#39FF14;color:#000000;text-decoration:none;font-weight:900;font-size:12px;letter-spacing:2px;padding:15px 32px;text-transform:uppercase;">${ctaLabel} &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${emailFooter}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Send ──────────────────────────────────────────────────────────────────────

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
