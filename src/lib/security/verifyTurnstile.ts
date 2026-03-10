/**
 * verifyTurnstile.ts
 *
 * Server-side verification of Cloudflare Turnstile tokens.
 * Never trust the client — always verify on the backend before
 * creating any payment intent or checkout session.
 *
 * Env vars required:
 *   TURNSTILE_SECRET_KEY  — your Cloudflare Turnstile secret key
 */

const CLOUDFLARE_SITEVERIFY_URL =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileResponse {
    success: boolean;
    /** ISO 8601 timestamp of the challenge */
    challenge_ts?: string;
    /** Hostname of the site where the challenge was answered */
    hostname?: string;
    /** Present only if success is false */
    'error-codes'?: string[];
}

/**
 * Verifies a Cloudflare Turnstile token with the server-side siteverify API.
 *
 * @param token     The cf-turnstile-response token submitted by the browser.
 * @param remoteIp  End-user IP address, forwarded to Cloudflare for risk scoring.
 * @returns         true if Cloudflare confirms the token is valid; false otherwise.
 */
export async function verifyTurnstile(
    token: string | undefined | null,
    remoteIp: string,
): Promise<boolean> {
    const secret = import.meta.env.TURNSTILE_SECRET_KEY;

    // Fail closed: if the secret is missing in production the request is denied.
    if (!secret) {
        if (import.meta.env.MODE === 'development') {
            console.warn(
                '[verifyTurnstile] TURNSTILE_SECRET_KEY not set — ' +
                'skipping verification in development mode.',
            );
            return true;
        }
        console.error('[verifyTurnstile] TURNSTILE_SECRET_KEY is not configured. Denying request.');
        return false;
    }

    if (!token || typeof token !== 'string' || token.trim() === '') {
        return false;
    }

    try {
        const body = new URLSearchParams({
            secret,
            response: token.trim(),
            remoteip: remoteIp,
        });

        const res = await fetch(CLOUDFLARE_SITEVERIFY_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    body.toString(),
        });

        if (!res.ok) {
            console.error(
                '[verifyTurnstile] Cloudflare siteverify returned HTTP',
                res.status,
            );
            return false;
        }

        const data = (await res.json()) as TurnstileResponse;

        if (!data.success && data['error-codes']?.length) {
            console.warn(
                '[verifyTurnstile] Verification failed. error-codes:',
                data['error-codes'].join(', '),
            );
        }

        return data.success === true;
    } catch (err) {
        console.error(
            '[verifyTurnstile] Unexpected error during verification:',
            err instanceof Error ? err.message : err,
        );
        return false;
    }
}
