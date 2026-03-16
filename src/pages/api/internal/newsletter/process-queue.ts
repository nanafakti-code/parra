import type { APIRoute } from 'astro';
import { processNewsletterQueueBatch } from '../../../../lib/newsletter/queue';
import { newsletterWorkerLimiter } from '../../../../lib/security/rateLimiter';
import { getClientIp } from '../../../../lib/security/getClientIp';

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function isAuthorized(request: Request): boolean {
    const workerSecret = import.meta.env.NEWSLETTER_WORKER_SECRET || process.env.NEWSLETTER_WORKER_SECRET;
    const cronSecret = process.env.CRON_SECRET;

    const headerSecret = request.headers.get('x-newsletter-worker-secret') || '';
    const bearer = request.headers.get('authorization') || '';

    if (workerSecret && headerSecret === workerSecret) {
        return true;
    }

    if (cronSecret && bearer === `Bearer ${cronSecret}`) {
        return true;
    }

    return false;
}

export const POST: APIRoute = async ({ request }) => {
    try {
        if (!isAuthorized(request)) {
            return jsonResponse({ message: 'No autorizado.' }, 401);
        }

        const ip = getClientIp(request);
        const { success } = await newsletterWorkerLimiter.limit(ip);
        if (!success) {
            return jsonResponse({ message: 'Rate limit excedido.' }, 429);
        }

        const url = new URL(request.url);
        const fromQuery = Number(url.searchParams.get('limit') || '0');
        let bodyLimit = 0;

        try {
            const body = await request.json();
            bodyLimit = Number(body?.limit || '0');
        } catch {
            // Body opcional.
        }

        const limit = fromQuery > 0 ? fromQuery : bodyLimit > 0 ? bodyLimit : 40;
        const result = await processNewsletterQueueBatch(limit);

        return jsonResponse({ success: true, ...result });
    } catch (error) {
        console.error('[newsletter/process-queue] Error:', error);
        return jsonResponse({ message: 'No se pudo procesar la cola.' }, 500);
    }
};
