import { supabaseAdmin } from '../supabase';
import {
    NEWSLETTER_DUPLICATE_MESSAGE,
    NEWSLETTER_SUCCESS_MESSAGE,
    WELCOME_SUBJECT,
} from './constants';
import { buildWelcomeEmailHtml, sendNewsletterEmail } from './email';
import { enqueueNewsletterEmail, processNewsletterQueueBatch, scheduleNewsletterQueueProcessing } from './queue';
import { isValidEmail, normalizeEmail } from './validation';

interface SubscribeInput {
    email: string;
    userId?: string | null;
    source?: string;
}

export type SubscribeResult = {
    ok: boolean;
    duplicate: boolean;
    message: string;
};

export async function subscribeToNewsletter(input: SubscribeInput): Promise<SubscribeResult> {
    const normalizedEmail = normalizeEmail(input.email);

    if (!isValidEmail(normalizedEmail)) {
        return {
            ok: false,
            duplicate: false,
            message: 'Introduce un email válido.',
        };
    }

    const { data: existing, error: findError } = await supabaseAdmin
        .from('newsletter_subscribers')
        .select('id, email, subscribed, user_id')
        .eq('email_normalized', normalizedEmail)
        .maybeSingle();

    if (findError) {
        throw new Error(`[newsletter] Error consultando suscriptores: ${findError.message}`);
    }

    if (existing?.subscribed) {
        return {
            ok: true,
            duplicate: true,
            message: NEWSLETTER_DUPLICATE_MESSAGE,
        };
    }

    let subscriberId: string | null = null;

    if (existing && !existing.subscribed) {
        const payload: Record<string, unknown> = {
            subscribed: true,
            unsubscribed_at: null,
            source: input.source || 'website',
            updated_at: new Date().toISOString(),
        };

        if (input.userId && !existing.user_id) {
            payload.user_id = input.userId;
        }

        const { data: updated, error: updateError } = await supabaseAdmin
            .from('newsletter_subscribers')
            .update(payload)
            .eq('id', existing.id)
            .eq('subscribed', false)
            .select('id')
            .maybeSingle();

        if (updateError) {
            throw new Error(`[newsletter] Error reactivando suscripción: ${updateError.message}`);
        }

        if (!updated) {
            return {
                ok: true,
                duplicate: true,
                message: NEWSLETTER_DUPLICATE_MESSAGE,
            };
        }

        subscriberId = updated.id;
    } else {
        const { data: created, error: insertError } = await supabaseAdmin
            .from('newsletter_subscribers')
            .insert({
                email: normalizedEmail,
                email_normalized: normalizedEmail,
                user_id: input.userId || null,
                subscribed: true,
                source: input.source || 'website',
            })
            .select('id')
            .single();

        if (insertError) {
            if (insertError.code === '23505') {
                return {
                    ok: true,
                    duplicate: true,
                    message: NEWSLETTER_DUPLICATE_MESSAGE,
                };
            }
            throw new Error(`[newsletter] Error insertando suscriptor: ${insertError.message}`);
        }

        subscriberId = created.id;
    }

    const welcomeHtml = buildWelcomeEmailHtml(normalizedEmail);
    let welcomeSentDirect = false;

    try {
        await sendNewsletterEmail({
            to: normalizedEmail,
            subject: WELCOME_SUBJECT,
            html: welcomeHtml,
        });
        welcomeSentDirect = true;
    } catch (directError) {
        console.error('[newsletter] Falló envío directo de bienvenida, se intentará por cola:', directError);
    }

    if (!welcomeSentDirect) {
        try {
            await enqueueNewsletterEmail({
                toEmail: normalizedEmail,
                eventKey: `welcome:${normalizedEmail}`,
                subject: WELCOME_SUBJECT,
                htmlContent: welcomeHtml,
                subscriberId,
                payload: {
                    type: 'welcome',
                },
            });
            scheduleNewsletterQueueProcessing();
            await processNewsletterQueueBatch(5).catch((processingError) => {
                console.error('[newsletter] Falló el procesamiento inmediato de la cola:', processingError);
            });
        } catch (queueError) {
            console.error('[newsletter] Suscriptor creado pero falló la cola de bienvenida:', queueError);
        }
    }

    return {
        ok: true,
        duplicate: false,
        message: NEWSLETTER_SUCCESS_MESSAGE,
    };
}

export async function getNewsletterPreference(options: {
    userId: string;
    email?: string | null;
}): Promise<{ subscribed: boolean; email: string | null }> {
    const { userId, email } = options;

    const { data: byUser } = await supabaseAdmin
        .from('newsletter_subscribers')
        .select('email, subscribed, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (byUser) {
        return { subscribed: !!byUser.subscribed, email: byUser.email };
    }

    if (email) {
        const normalized = normalizeEmail(email);
        const { data: byEmail } = await supabaseAdmin
            .from('newsletter_subscribers')
            .select('email, subscribed')
            .eq('email_normalized', normalized)
            .maybeSingle();

        if (byEmail) {
            return { subscribed: !!byEmail.subscribed, email: byEmail.email };
        }
    }

    return { subscribed: false, email: email ? normalizeEmail(email) : null };
}

export async function setNewsletterPreference(options: {
    userId: string;
    email: string;
    subscribe: boolean;
}): Promise<{ subscribed: boolean }> {
    const normalizedEmail = normalizeEmail(options.email);

    if (!isValidEmail(normalizedEmail)) {
        throw new Error('Email inválido.');
    }

    const { data: existing } = await supabaseAdmin
        .from('newsletter_subscribers')
        .select('id, subscribed')
        .eq('email_normalized', normalizedEmail)
        .maybeSingle();

    if (!existing) {
        const { error: insertError } = await supabaseAdmin
            .from('newsletter_subscribers')
            .insert({
                email: normalizedEmail,
                email_normalized: normalizedEmail,
                user_id: options.userId,
                subscribed: options.subscribe,
                unsubscribed_at: options.subscribe ? null : new Date().toISOString(),
                source: 'profile',
            });

        if (insertError) {
            throw new Error(`[newsletter] Error guardando preferencia: ${insertError.message}`);
        }

        return { subscribed: options.subscribe };
    }

    const { error: updateError } = await supabaseAdmin
        .from('newsletter_subscribers')
        .update({
            user_id: options.userId,
            subscribed: options.subscribe,
            unsubscribed_at: options.subscribe ? null : new Date().toISOString(),
            source: 'profile',
            updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('subscribed', options.subscribe === true ? false : true);

    if (updateError) {
        throw new Error(`[newsletter] Error actualizando preferencia: ${updateError.message}`);
    }

    if (options.subscribe && !existing.subscribed) {
        const welcomeHtml = buildWelcomeEmailHtml(normalizedEmail);
        let welcomeSentDirect = false;

        try {
            await sendNewsletterEmail({
                to: normalizedEmail,
                subject: WELCOME_SUBJECT,
                html: welcomeHtml,
            });
            welcomeSentDirect = true;
        } catch (directError) {
            console.error('[newsletter] Falló envío directo de bienvenida desde perfil, se intentará por cola:', directError);
        }

        if (!welcomeSentDirect) {
            try {
                await enqueueNewsletterEmail({
                    toEmail: normalizedEmail,
                    eventKey: `welcome-profile:${normalizedEmail}`,
                    subject: WELCOME_SUBJECT,
                    htmlContent: welcomeHtml,
                    subscriberId: existing.id,
                    payload: { type: 'welcome-profile' },
                });
                scheduleNewsletterQueueProcessing();
                await processNewsletterQueueBatch(5).catch((processingError) => {
                    console.error('[newsletter] Falló el procesamiento inmediato de la cola (perfil):', processingError);
                });
            } catch (queueError) {
                console.error('[newsletter] Preferencia actualizada pero falló la cola de bienvenida:', queueError);
            }
        }
    }

    return { subscribed: options.subscribe };
}
