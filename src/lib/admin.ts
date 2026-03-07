import type { AstroGlobal } from 'astro';
import { supabaseAdmin } from './supabase';

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
    let accessToken = cookies.get('sb-access-token')?.value || cookies.get('auth_token')?.value;
    const refreshToken = cookies.get('sb-refresh-token')?.value;

    if (!accessToken) {
        return jsonResponse({ error: 'No autorizado' }, 401);
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = import.meta.env.SUPABASE_URL || '';
    const supabaseKey = import.meta.env.SUPABASE_ANON_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    let { data: { user }, error } = await supabase.auth.getUser(accessToken);

    // Si el token expiró, intentar refresh
    if ((!user || error) && refreshToken) {
        try {
            const { data: refreshData, error: refreshError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            });

            if (refreshData?.session && !refreshError) {
                // Actualizar cookies con los nuevos tokens
                const cookieOptions = {
                    path: '/',
                    httpOnly: true,
                    secure: import.meta.env.PROD,
                    sameSite: 'lax' as const,
                    maxAge: 60 * 60 * 24 * 7,
                };
                cookies.set('sb-access-token', refreshData.session.access_token, cookieOptions);
                cookies.set('sb-refresh-token', refreshData.session.refresh_token, cookieOptions);

                accessToken = refreshData.session.access_token;
                user = refreshData.session.user;
                error = null;
            }
        } catch (e) {
            // Si falla el refresh, continuamos con el error original
        }
    }

    if (!user || error) {
        console.error('[validateAdminAPI] Token inválido. Error:', error?.message, 'User:', user?.id);
        return jsonResponse({ error: 'Token inválido' }, 401);
    }

    console.log('[validateAdminAPI] Auth user:', { id: user.id, email: user.email });

    let dbUser: any = null;
    const { data: byId, error: byIdError } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, is_active')
        .eq('id', user.id)
        .maybeSingle();

    console.log('[validateAdminAPI] Lookup by ID:', { byId, byIdError: byIdError?.message });

    if (byId) {
        dbUser = byId;
    } else {
        // Try case-insensitive email match
        const userEmail = (user.email || '').toLowerCase().trim();
        const { data: byEmail, error: byEmailError } = await supabaseAdmin
            .from('users')
            .select('id, name, email, role, is_active')
            .ilike('email', userEmail)
            .maybeSingle();

        console.log('[validateAdminAPI] Lookup by email:', { userEmail, byEmail, byEmailError: byEmailError?.message });
        dbUser = byEmail;
    }

    if (!dbUser || dbUser.role !== 'admin' || !dbUser.is_active) {
        console.error('[validateAdminAPI] Access denied.', {
            dbUser: dbUser ? { id: dbUser.id, email: dbUser.email, role: dbUser.role, is_active: dbUser.is_active } : null,
            authUser: { id: user.id, email: user.email }
        });
        return jsonResponse({ error: 'Acceso denegado' }, 403);
    }

    return { admin: dbUser };
}
