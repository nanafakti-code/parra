import type { APIRoute } from 'astro';
import { getNewsletterPreference, setNewsletterPreference } from '../../../lib/newsletter/subscribers';
import { isSameOriginRequest } from '../../../lib/security/requestOrigin';
import { newsletterLimiter } from '../../../lib/security/rateLimiter';
import { getClientIp } from '../../../lib/security/getClientIp';

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user?.id) {
        return jsonResponse({ message: 'No autorizado.' }, 401);
    }

    try {
        const preference = await getNewsletterPreference({
            userId: locals.user.id,
            email: locals.user.email || null,
        });

        return jsonResponse({
            subscribed: preference.subscribed,
            email: preference.email,
        });
    } catch (error) {
        console.error('[newsletter/preferences][GET] Error:', error);
        return jsonResponse({ message: 'No se pudo obtener la preferencia.' }, 500);
    }
};

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user?.id || !locals.user.email) {
        return jsonResponse({ message: 'No autorizado.' }, 401);
    }

    if (!isSameOriginRequest(request)) {
        return jsonResponse({ message: 'Solicitud no permitida.' }, 403);
    }

    try {
        const ip = getClientIp(request);
        const rateKey = `${locals.user.id}:${ip}`;
        const { success } = await newsletterLimiter.limit(rateKey);
        if (!success) {
            return jsonResponse({ message: 'Demasiadas solicitudes. Inténtalo en unos minutos.' }, 429);
        }

        const body = await request.json();
        const action = String(body?.action || '').toLowerCase();

        if (action !== 'subscribe' && action !== 'unsubscribe') {
            return jsonResponse({ message: 'Acción inválida.' }, 400);
        }

        const result = await setNewsletterPreference({
            userId: locals.user.id,
            email: locals.user.email,
            subscribe: action === 'subscribe',
        });

        return jsonResponse({
            subscribed: result.subscribed,
            message: result.subscribed
                ? 'Tu suscripción está activa.'
                : 'Tu suscripción ha sido cancelada correctamente.',
        });
    } catch (error) {
        console.error('[newsletter/preferences][POST] Error:', error);
        return jsonResponse({ message: 'No se pudo actualizar la preferencia.' }, 500);
    }
};
