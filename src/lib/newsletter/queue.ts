import { supabaseAdmin } from '../supabase';
import { sendNewsletterEmail } from './email';
import { NEWSLETTER_BATCH_SIZE, QUEUE_DEFAULT_LIMIT } from './constants';
import { normalizeEmail } from './validation';

const STALE_PROCESSING_MINUTES = 15;
let queueKickScheduled = false;

export interface QueueEmailInput {
    toEmail: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
    subscriberId?: string | null;
    eventKey?: string;
    payload?: Record<string, unknown>;
    scheduledAt?: string;
}

async function logQueueEvent(input: {
    queueId?: string | null;
    event: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    metadata?: Record<string, unknown>;
}): Promise<void> {
    try {
        await supabaseAdmin.from('newsletter_queue_logs').insert({
            queue_id: input.queueId || null,
            event: input.event,
            level: input.level,
            message: input.message,
            metadata: input.metadata || {},
        });
    } catch (error) {
        console.error('[newsletter-queue] Error escribiendo log de cola:', error);
    }
}

async function registerEventDispatch(options: {
    eventKey: string;
    eventType: string;
    payload?: Record<string, unknown>;
}): Promise<boolean> {
    const { error } = await supabaseAdmin
        .from('newsletter_event_dispatches')
        .insert({
            event_key: options.eventKey,
            event_type: options.eventType,
            payload: options.payload || {},
            queued_count: 0,
        });

    if (!error) return true;

    if (error.code === '23505') {
        await supabaseAdmin
            .from('newsletter_event_dispatches')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('event_key', options.eventKey);
        return false;
    }

    throw new Error(`[newsletter-queue] Error registrando evento: ${error.message}`);
}

async function recoverStaleProcessingJobs(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000).toISOString();
    const { data: staleJobs, error } = await supabaseAdmin
        .from('newsletter_email_queue')
        .select('id, attempts, max_attempts')
        .eq('status', 'processing')
        .lte('processing_started_at', cutoff)
        .limit(200);

    if (error) {
        throw new Error(`[newsletter-queue] Error buscando jobs atascados: ${error.message}`);
    }

    let recovered = 0;

    for (const job of staleJobs || []) {
        const nextAttempts = Number(job.attempts || 0) + 1;
        const shouldFail = nextAttempts >= Number(job.max_attempts || 3);
        const retryAt = new Date(Date.now() + 2 * 60_000).toISOString();

        const { error: updateError } = await supabaseAdmin
            .from('newsletter_email_queue')
            .update({
                status: shouldFail ? 'failed' : 'pending',
                attempts: nextAttempts,
                scheduled_at: shouldFail ? new Date().toISOString() : retryAt,
                last_error: `Recuperado tras lock de procesamiento > ${STALE_PROCESSING_MINUTES} min`,
                processing_started_at: null,
            })
            .eq('id', job.id)
            .eq('status', 'processing');

        if (updateError) {
            await logQueueEvent({
                queueId: job.id,
                event: 'recover-stale-job-failed',
                level: 'error',
                message: `No se pudo recuperar job atascado: ${updateError.message}`,
            });
            continue;
        }

        recovered += 1;
        await logQueueEvent({
            queueId: job.id,
            event: 'recover-stale-job',
            level: 'warn',
            message: shouldFail
                ? 'Job atascado marcado como failed por máximo de intentos.'
                : 'Job atascado recuperado y reencolado.',
            metadata: { nextAttempts, shouldFail },
        });
    }

    return recovered;
}

export async function enqueueNewsletterEmail(input: QueueEmailInput): Promise<void> {
    const toEmail = normalizeEmail(input.toEmail);

    const { data, error } = await supabaseAdmin
        .from('newsletter_email_queue')
        .insert({
            to_email: toEmail,
            event_key: input.eventKey || null,
            subject: input.subject,
            html_content: input.htmlContent,
            text_content: input.textContent || null,
            subscriber_id: input.subscriberId || null,
            payload: input.payload || {},
            scheduled_at: input.scheduledAt || new Date().toISOString(),
            status: 'pending',
        })
        .select('id')
        .single();

    if (error) {
        if (error.code === '23505' && input.eventKey) {
            await logQueueEvent({
                event: 'skip-duplicate-email',
                level: 'warn',
                message: 'Email duplicado omitido por índice único de evento.',
                metadata: { eventKey: input.eventKey, toEmail },
            });
            return;
        }
        throw new Error(`[newsletter-queue] No se pudo encolar email: ${error.message}`);
    }

    await logQueueEvent({
        queueId: data?.id,
        event: 'enqueue-email',
        level: 'info',
        message: 'Email encolado correctamente.',
        metadata: { eventKey: input.eventKey || null, toEmail },
    });
}

export async function enqueueNewsletterBroadcast(options: {
    eventKey: string;
    eventType: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
    payload?: Record<string, unknown>;
}): Promise<{ queued: number; duplicateEvent: boolean }> {
    const inserted = await registerEventDispatch({
        eventKey: options.eventKey,
        eventType: options.eventType,
        payload: options.payload,
    });

    if (!inserted) {
        await logQueueEvent({
            event: 'skip-duplicate-event',
            level: 'warn',
            message: 'Evento de newsletter duplicado omitido.',
            metadata: { eventKey: options.eventKey, eventType: options.eventType },
        });
        return { queued: 0, duplicateEvent: true };
    }

    let from = 0;
    let queued = 0;

    while (true) {
        const to = from + NEWSLETTER_BATCH_SIZE - 1;
        const { data, error } = await supabaseAdmin
            .from('newsletter_subscribers')
            .select('id, email')
            .eq('subscribed', true)
            .order('created_at', { ascending: true })
            .range(from, to);

        if (error) {
            throw new Error(`[newsletter-queue] Error consultando suscriptores: ${error.message}`);
        }

        if (!data || data.length === 0) break;

        const rows = data.map((subscriber) => ({
            to_email: normalizeEmail(subscriber.email),
            event_key: options.eventKey,
            subject: options.subject,
            html_content: options.htmlContent,
            text_content: options.textContent || null,
            subscriber_id: subscriber.id,
            payload: options.payload || {},
            status: 'pending',
            scheduled_at: new Date().toISOString(),
        }));

        const { error: insertError } = await supabaseAdmin
            .from('newsletter_email_queue')
            .upsert(rows, { onConflict: 'event_key,to_email', ignoreDuplicates: true });

        if (insertError) {
            throw new Error(`[newsletter-queue] Error encolando broadcast: ${insertError.message}`);
        }

        queued += rows.length;
        from += NEWSLETTER_BATCH_SIZE;
    }

    if (queued > 0) {
        await supabaseAdmin
            .from('newsletter_event_dispatches')
            .update({ queued_count: queued, last_seen_at: new Date().toISOString() })
            .eq('event_key', options.eventKey);

        await logQueueEvent({
            event: 'enqueue-broadcast',
            level: 'info',
            message: 'Broadcast encolado para newsletter.',
            metadata: { eventKey: options.eventKey, eventType: options.eventType, queued },
        });

        scheduleNewsletterQueueProcessing(Math.min(50, queued));
    }

    return { queued, duplicateEvent: false };
}

export async function processNewsletterQueueBatch(limit = QUEUE_DEFAULT_LIMIT): Promise<{
    picked: number;
    sent: number;
    failed: number;
    requeued: number;
    recovered: number;
}> {
    const nowIso = new Date().toISOString();
    const safeLimit = Math.max(1, Math.min(limit, 200));

    const recovered = await recoverStaleProcessingJobs();

    const { data: jobs, error } = await supabaseAdmin
        .from('newsletter_email_queue')
        .select('id, to_email, subject, html_content, text_content, attempts, max_attempts')
        .eq('status', 'pending')
        .lte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true })
        .limit(safeLimit);

    if (error) {
        throw new Error(`[newsletter-queue] Error obteniendo jobs: ${error.message}`);
    }

    if (!jobs || jobs.length === 0) {
        return { picked: 0, sent: 0, failed: 0, requeued: 0, recovered };
    }

    const jobIds = jobs.map((job) => job.id);
    const { data: claimedJobs, error: claimError } = await supabaseAdmin
        .from('newsletter_email_queue')
        .update({
            status: 'processing',
            processing_started_at: nowIso,
            updated_at: nowIso,
        })
        .in('id', jobIds)
        .eq('status', 'pending')
        .select('id, to_email, subject, html_content, text_content, attempts, max_attempts');

    if (claimError) {
        throw new Error(`[newsletter-queue] Error bloqueando jobs: ${claimError.message}`);
    }

    await logQueueEvent({
        event: 'claim-batch',
        level: 'info',
        message: 'Lote de cola reclamado para procesamiento.',
        metadata: { picked: (claimedJobs || []).length, limit: safeLimit, recovered },
    });

    let sent = 0;
    let failed = 0;
    let requeued = 0;

    for (const job of claimedJobs || []) {
        const nextAttempts = (job.attempts || 0) + 1;

        try {
            const providerMessageId = await sendNewsletterEmail({
                to: job.to_email,
                subject: job.subject,
                html: job.html_content,
                text: job.text_content || undefined,
            });

            const { error: sentError } = await supabaseAdmin
                .from('newsletter_email_queue')
                .update({
                    status: 'sent',
                    attempts: nextAttempts,
                    sent_at: new Date().toISOString(),
                    provider_message_id: providerMessageId,
                    last_error: null,
                    processing_started_at: null,
                })
                .eq('id', job.id)
                .eq('status', 'processing');

            if (sentError) {
                throw new Error(sentError.message);
            }

            sent += 1;
            await logQueueEvent({
                queueId: job.id,
                event: 'send-success',
                level: 'info',
                message: 'Email enviado correctamente.',
                metadata: { attempts: nextAttempts, providerMessageId },
            });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message.slice(0, 500) : 'Error desconocido al enviar email';
            const shouldFail = nextAttempts >= (job.max_attempts || 3);

            const retryDelayMinutes = Math.min(30, Math.max(1, nextAttempts * 2));
            const retryAt = new Date(Date.now() + retryDelayMinutes * 60_000).toISOString();

            const { error: failedError } = await supabaseAdmin
                .from('newsletter_email_queue')
                .update({
                    status: shouldFail ? 'failed' : 'pending',
                    attempts: nextAttempts,
                    last_error: errorMessage,
                    scheduled_at: shouldFail ? nowIso : retryAt,
                    processing_started_at: null,
                })
                .eq('id', job.id)
                .eq('status', 'processing');

            if (failedError) {
                console.error('[newsletter-queue] Error actualizando estado de job fallido:', failedError.message);
            }

            if (shouldFail) {
                failed += 1;
            } else {
                requeued += 1;
            }

            await logQueueEvent({
                queueId: job.id,
                event: shouldFail ? 'send-failed-terminal' : 'send-failed-retry',
                level: shouldFail ? 'error' : 'warn',
                message: shouldFail
                    ? 'Email marcado como fallido definitivo.'
                    : 'Email falló, reencolado para reintento.',
                metadata: {
                    attempts: nextAttempts,
                    maxAttempts: job.max_attempts,
                    retryAt: shouldFail ? null : retryAt,
                    errorMessage,
                },
            });
        }
    }

    return {
        picked: (claimedJobs || []).length,
        sent,
        failed,
        requeued,
        recovered,
    };
}

export function scheduleNewsletterQueueProcessing(limit = 10): void {
    if (queueKickScheduled) return;
    queueKickScheduled = true;

    setTimeout(() => {
        processNewsletterQueueBatch(limit).catch((error) => {
            console.error('[newsletter-queue] Error en procesamiento asíncrono:', error);
        }).finally(() => {
            queueKickScheduled = false;
        });
    }, 0);
}
