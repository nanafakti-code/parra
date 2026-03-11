import type { AstroGlobal } from 'astro';
import { supabase, supabaseAdmin } from './supabase';

/**
 * Admin guard – validates the current user is an active admin.
 * Returns the admin user or redirects to /admin/login.
 */
export async function requireAdmin(Astro: AstroGlobal) {
    const { user, role } = Astro.locals;

    if (!user || role !== 'admin') {
        return Astro.redirect('/admin/login');
    }

    // Double-check: verify is_active in DB (defense in depth)
    // Use email fallback in case auth UUID differs from public.users UUID (manual user creation)
    let dbUser: any = null;
    const { data: byId } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, is_active, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
    if (byId) {
        dbUser = byId;
    } else {
        const { data: byEmail } = await supabaseAdmin
            .from('users')
            .select('id, name, email, role, is_active, avatar_url')
            .eq('email', user.email)
            .maybeSingle();
        dbUser = byEmail;
    }

    if (!dbUser || dbUser.role !== 'admin' || !dbUser.is_active) {
        return Astro.redirect('/admin/login');
    }

    return dbUser;
}

/**
 * Log an admin action for audit trail
 */
export async function logAdminAction(
    adminId: string,
    action: string,
    entityType?: string,
    entityId?: string,
    details?: Record<string, unknown>,
    ipAddress?: string
) {
    try {
        await supabaseAdmin.from('admin_logs').insert({
            admin_id: adminId,
            action,
            entity_type: entityType || null,
            entity_id: entityId || null,
            details: details || {},
            ip_address: ipAddress || null,
        });
    } catch (e) {
        console.error('[admin-log] Error logging action:', e);
    }
}

/** JSON API response helper */
export function jsonResponse(data: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Validate admin API request – returns admin user or error Response */
export async function validateAdminAPI(request: Request, cookies: any): Promise<{ admin: any } | Response> {
    // Primary: Astro cookies object
    let accessToken = cookies.get('sb-access-token')?.value || cookies.get('auth_token')?.value;

    // Fallback: parse Cookie header directly (more reliable on Vercel for non-GET fetch requests)
    if (!accessToken) {
        const cookieHeader = request.headers.get('cookie') || '';
        for (const part of cookieHeader.split(';')) {
            const eqIdx = part.indexOf('=');
            if (eqIdx === -1) continue;
            const name = part.slice(0, eqIdx).trim();
            if (name === 'sb-access-token' || name === 'auth_token') {
                accessToken = part.slice(eqIdx + 1).trim();
                break;
            }
        }
    }

    if (!accessToken) {
        console.error('[validateAdminAPI] error: No autorizado, no accessToken provided in cookies.', cookies);
        return jsonResponse({ error: 'No autorizado' }, 401);
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = import.meta.env.SUPABASE_URL || '';
    const supabaseKey = import.meta.env.SUPABASE_ANON_KEY || '';
    const authClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    const { data: { user }, error } = await authClient.auth.getUser(accessToken);
    let resolvedUser = (!error && user) ? user : null;

    // Si el token expiró, intentar renovar con refresh token
    if (!resolvedUser) {
        let refreshToken = cookies.get('sb-refresh-token')?.value;
        if (!refreshToken) {
            const cookieHeader = request.headers.get('cookie') || '';
            for (const part of cookieHeader.split(';')) {
                const eqIdx = part.indexOf('=');
                if (eqIdx === -1) continue;
                const name = part.slice(0, eqIdx).trim();
                if (name === 'sb-refresh-token') {
                    refreshToken = part.slice(eqIdx + 1).trim();
                    break;
                }
            }
        }
        if (refreshToken) {
            const { data: { session, user: rUser }, error: rErr } = await authClient.auth.refreshSession({ refresh_token: refreshToken });
            if (session && rUser && !rErr) {
                const cookieOpts = { path: '/', httpOnly: true, secure: import.meta.env.PROD as boolean, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 7 };
                cookies.set('sb-access-token', session.access_token, cookieOpts);
                cookies.set('sb-refresh-token', session.refresh_token, cookieOpts);
                resolvedUser = rUser;
                console.log('[validateAdminAPI] Token renovado automáticamente para:', rUser.email);
            }
        }
    }

    if (!resolvedUser) {
        console.error('[validateAdminAPI] error: Token inválido.', error);
        return jsonResponse({ error: `Token inválido: ${error?.message || 'Desconocido'}` }, 401);
    }

    let dbUser: any = null;
    const { data: byId } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, is_active')
        .eq('id', resolvedUser.id)
        .maybeSingle();
    if (byId) {
        dbUser = byId;
    } else {
        const { data: byEmail } = await supabaseAdmin
            .from('users')
            .select('id, name, email, role, is_active')
            .eq('email', resolvedUser.email)
            .maybeSingle();
        dbUser = byEmail;
    }

    if (!dbUser || dbUser.role !== 'admin' || !dbUser.is_active) {
        return jsonResponse({ error: 'Acceso denegado' }, 403);
    }

    return { admin: dbUser };
}
