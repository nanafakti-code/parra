import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '../../../lib/supabase';
import { loginLimiter } from '../../../lib/security/rateLimiter';
import { getClientIp } from '../../../lib/security/getClientIp';

function json(data: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const POST: APIRoute = async ({ request, cookies }) => {
    try {
        const ip = getClientIp(request);
        const { success } = await loginLimiter.limit(ip);
        if (!success) {
            return json({ message: 'Demasiados intentos. Por favor, espera unos segundos.' }, 429);
        }

        const body = await request.json();
        const { email, password } = body as { email?: string; password?: string };

        if (!email?.trim() || !password) {
            return json({ message: 'Email y contraseña son obligatorios.' }, 400);
        }

        // 1. Authenticate with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });

        if (authError || !authData.session || !authData.user) {
            return json({ message: 'Credenciales inválidas.' }, 401);
        }

        // 2. Verify user is admin & active (match by email for resilience)
        const { data: dbUser } = await supabaseAdmin
            .from('users')
            .select('id, role, is_active')
            .eq('email', email.trim())
            .maybeSingle();

        if (!dbUser || dbUser.role !== 'admin' || !dbUser.is_active) {
            return json({ message: 'Acceso denegado. No tienes permisos de administrador.' }, 403);
        }

        // 3. Set cookies
        const cookieOptions = {
            path: '/',
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: 'lax' as const,
            maxAge: 60 * 60 * 4, // 4 horas para sesiones de administrador
        };

        cookies.set('sb-access-token', authData.session.access_token, cookieOptions);
        cookies.set('sb-refresh-token', authData.session.refresh_token, cookieOptions);

        // 4. Log admin access
        try {
            await supabaseAdmin.from('admin_logs').insert({
                admin_id: dbUser.id,
                action: 'login',
                entity_type: 'auth',
                details: { email: email.trim() },
                ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
            });
        } catch (_) { /* non-critical */ }

        return json({ message: 'Acceso concedido.' }, 200);
    } catch (err) {
        console.error('[admin-login] Error:', err);
        return json({ message: 'Error interno del servidor.' }, 500);
    }
};
