import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse } from '../../../lib/admin';
import { processNewsletterQueueBatch } from '../../../lib/newsletter/queue';
import { isSameOriginRequest } from '../../../lib/security/requestOrigin';

async function getQueueCount(status: 'pending' | 'processing' | 'sent' | 'failed'): Promise<number> {
    const { count } = await supabaseAdmin
        .from('newsletter_email_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);

    return count || 0;
}

export const GET: APIRoute = async ({ request, cookies }) => {
    const authResult = await validateAdminAPI(request, cookies);
    if (authResult instanceof Response) return authResult;

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 50), 200));

    let queueQuery = supabaseAdmin
        .from('newsletter_email_queue')
        .select('id, event_key, to_email, subject, status, attempts, max_attempts, scheduled_at, processing_started_at, sent_at, provider_message_id, last_error, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status && ['pending', 'processing', 'sent', 'failed'].includes(status)) {
        queueQuery = queueQuery.eq('status', status as 'pending' | 'processing' | 'sent' | 'failed');
    }

    const [{ data: jobs, error: jobsError }, { data: logs }] = await Promise.all([
        queueQuery,
        supabaseAdmin
            .from('newsletter_queue_logs')
            .select('id, queue_id, event, level, message, metadata, created_at')
            .order('created_at', { ascending: false })
            .limit(100),
    ]);

    if (jobsError) {
        return jsonResponse({ error: `Error obteniendo cola: ${jobsError.message}` }, 500);
    }

    const [pending, processing, sent, failed] = await Promise.all([
        getQueueCount('pending'),
        getQueueCount('processing'),
        getQueueCount('sent'),
        getQueueCount('failed'),
    ]);

    return jsonResponse({
        stats: {
            pending,
            processing,
            sent,
            failed,
            total: pending + processing + sent + failed,
        },
        jobs: jobs || [],
        logs: logs || [],
    });
};

export const POST: APIRoute = async ({ request, cookies }) => {
    const authResult = await validateAdminAPI(request, cookies);
    if (authResult instanceof Response) return authResult;

    if (!isSameOriginRequest(request)) {
        return jsonResponse({ error: 'Solicitud no permitida.' }, 403);
    }

    let limit = 40;
    try {
        const body = await request.json();
        if (body?.limit) {
            limit = Math.max(1, Math.min(Number(body.limit), 200));
        }
    } catch {
        // Body opcional.
    }

    try {
        const result = await processNewsletterQueueBatch(limit);
        return jsonResponse({
            message: 'Procesamiento manual completado.',
            ...result,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido';
        return jsonResponse({ error: `Error procesando cola: ${msg}` }, 500);
    }
};
