import type { APIRoute } from 'astro';
import { getClientIp } from '../../../lib/security/getClientIp';
import { newsletterLimiter } from '../../../lib/security/rateLimiter';
import { isSameOriginRequest } from '../../../lib/security/requestOrigin';
import { subscribeToNewsletter } from '../../../lib/newsletter/subscribers';
import { sanitizeNewsletterText } from '../../../lib/newsletter/validation';

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        if (!isSameOriginRequest(request)) {
            return jsonResponse({ message: 'Solicitud no permitida.' }, 403);
        }

        const ip = getClientIp(request);
        const { success } = await newsletterLimiter.limit(ip);
        if (!success) {
            return jsonResponse({ message: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' }, 429);
        }

        const contentType = request.headers.get('content-type') || '';
        let email = '';
        let website = '';
        let source = 'website';

        if (contentType.includes('application/json')) {
            const body = await request.json();
            email = sanitizeNewsletterText(String(body?.email || ''));
            website = sanitizeNewsletterText(String(body?.website || ''));
            source = sanitizeNewsletterText(String(body?.source || 'website')).slice(0, 40) || 'website';
        } else {
            const formData = await request.formData();
            email = sanitizeNewsletterText(String(formData.get('email') || ''));
            website = sanitizeNewsletterText(String(formData.get('website') || ''));
            source = sanitizeNewsletterText(String(formData.get('source') || 'website')).slice(0, 40) || 'website';
        }

        // Honeypot anti-bots: responder éxito silencioso sin procesar.
        if (website) {
            return jsonResponse({ success: true, message: '¡Gracias por unirte al Club Parra! Revisa tu correo.' });
        }

        const result = await subscribeToNewsletter({
            email,
            userId: locals.user?.id || null,
            source,
        });

        if (!result.ok) {
            return jsonResponse({ message: result.message }, 400);
        }

        return jsonResponse({
            success: true,
            duplicate: result.duplicate,
            message: result.message,
        });
    } catch (error) {
        console.error('[newsletter/subscribe] Error:', error);
        return jsonResponse({ message: 'No se pudo procesar la suscripción.' }, 500);
    }
};
