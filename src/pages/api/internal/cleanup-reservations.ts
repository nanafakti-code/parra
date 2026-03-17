/**
 * GET /api/internal/cleanup-reservations
 *
 * Vercel Cron backup for stock reservation cleanup (Blocker 3 fix).
 *
 * Purpose:
 *   Runs release_expired_reservations() as a redundant safety net
 *   in case the Supabase pg_cron job is not scheduled, fails, or
 *   the Supabase project is paused (Free tier auto-pause).
 *
 * Schedule: every 5 minutes via vercel.json crons config.
 *
 * Auth: Vercel automatically injects
 *   Authorization: Bearer <CRON_SECRET>
 *   into requests originating from its cron scheduler.
 *   Set CRON_SECRET as an environment variable in your Vercel
 *   project settings (Settings → Environment Variables).
 *
 * Manual trigger (for testing):
 *   curl -X GET https://your-site.vercel.app/api/internal/cleanup-reservations \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET"
 */

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';

function isAuthorized(request: Request): boolean {
    const cronSecret = import.meta.env.CRON_SECRET || process.env.CRON_SECRET || '';

    // CRON_SECRET must be set — fail closed if it is missing
    if (!cronSecret) {
        console.error('[cleanup-reservations] CRON_SECRET env var not configured.');
        return false;
    }

    const authHeader = request.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${cronSecret}`;
}

export const GET: APIRoute = async ({ request }) => {
    if (!isAuthorized(request)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { data: released, error } = await supabaseAdmin
            .rpc('release_expired_reservations');

        if (error) {
            console.error('[cleanup-reservations] RPC error:', error.message);
            return new Response(
                JSON.stringify({ success: false, error: error.message }),
                { status: 500, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const count = released ?? 0;

        if (count > 0) {
            console.log(`[cleanup-reservations] Released ${count} expired reservation(s).`);
        }

        return new Response(
            JSON.stringify({ success: true, released: count }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[cleanup-reservations] Unexpected error:', msg);
        return new Response(
            JSON.stringify({ success: false, error: msg }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
};
