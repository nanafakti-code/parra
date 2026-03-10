import { defineMiddleware } from "astro:middleware";
import { supabase, supabaseAdmin } from "./lib/supabase";

/**
 * Middleware de autenticación global para Astro SSR.
 * 
 * Flujo:
 * 1. Intenta obtener el token de acceso desde las cookies (sb-access-token).
 * 2. Si existe, valida el token con supabase.auth.getUser().
 * 3. Si el usuario es válido, adjunta el usuario a locals.user.
 * 4. Busca el rol del usuario en la tabla 'users' y lo adjunta a locals.role.
 */
export const onRequest = defineMiddleware(async ({ cookies, locals, request, redirect }, next) => {
    const url = new URL(request.url);

    // 1. Obtener access_token desde cookies para poder validar usuario antes de decidir redirección por mantenimiento
    const accessToken = cookies.get("sb-access-token")?.value;

    locals.user = null;
    locals.role = null;

    if (accessToken) {
        // Validar usuario con Supabase Auth (sin usar admin para este paso)
        try {
            const { data: { user }, error } = await supabase.auth.getUser(accessToken);
            if (user && !error) {
                locals.user = user;

                // Obtener rol desde la tabla users (busca por id primero, con fallback a email)
                let profile: { role: string } | null = null;

                const { data: byId } = await supabaseAdmin
                    .from("users")
                    .select("id, role")
                    .eq("id", user.id)
                    .maybeSingle();

                if (byId) {
                    profile = byId;
                } else {
                    const { data: byEmail } = await supabaseAdmin
                        .from("users")
                        .select("id, role")
                        .eq("email", user.email)
                        .maybeSingle();
                    profile = byEmail;
                }

                locals.role = profile?.role || "customer";
            }
        } catch (e) {
            console.error('[middleware] auth.getUser error', e);
        }
    }

    // 2. Comprobar modo mantenimiento: primero revisar variable de entorno, si no está, consultar site_settings
    let isMaintenanceMode = false;
    // Env override (fast)
    const rawEnv = import.meta.env.MAINTENANCE_MODE || (typeof process !== 'undefined' ? process.env.MAINTENANCE_MODE : false);
    if (rawEnv && String(rawEnv).trim().length > 0) {
        isMaintenanceMode = String(rawEnv).trim().toLowerCase() === 'true';
    } else {
        // Fallback: read from DB (site_settings key: 'maintenance')
        try {
            const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', 'maintenance').maybeSingle();
            if (data && data.value) {
                const v = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
                try {
                    const parsed = JSON.parse(v);
                    isMaintenanceMode = !!parsed.enabled;
                } catch {
                    isMaintenanceMode = String(v).trim().toLowerCase() === 'true';
                }
            }
        } catch (e) {
            console.error('[middleware] error reading maintenance setting', e);
            isMaintenanceMode = false;
        }
    }

    // Solo redirigir si está en mantenimiento y el visitante NO es admin
    const isAdmin = locals.role === 'admin';
    if (
        isMaintenanceMode &&
        !isAdmin &&
        url.pathname !== '/maintenance' &&
        !url.pathname.startsWith('/admin') &&
        !url.pathname.startsWith('/_astro') &&
        !url.pathname.startsWith('/api') &&
        !url.pathname.match(/\.(png|jpg|jpeg|svg|css|js|ico)$/)
    ) {
        return redirect('/maintenance', 302);
    }



    const response = await next();

    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
    response.headers.set(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self' https://js.stripe.com https://challenges.cloudflare.com",
            "frame-src https://js.stripe.com https://challenges.cloudflare.com",
            "connect-src 'self' https://api.stripe.com https://jboxsbtfhkanvnhxuxdd.supabase.co",
            "img-src 'self' data: https:",
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
        ].join('; ')
    );

    return response;
});
