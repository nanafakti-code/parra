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

    // 1. Obtener access_token y refresh_token desde cookies
    const accessToken = cookies.get("sb-access-token")?.value;
    const refreshToken = cookies.get("sb-refresh-token")?.value;

    locals.user = null;
    locals.role = null;

    if (accessToken) {
        // Validar usuario con Supabase Auth (sin usar admin para este paso)
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
            let resolvedUser = (authData.user && !authError) ? authData.user : null;

            // Si el token expiró, intentar renovar con refresh token
            if (!resolvedUser && refreshToken) {
                const { data: { session, user: rUser }, error: rErr } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
                if (session && rUser && !rErr) {
                    const opts = { path: '/', httpOnly: true, secure: import.meta.env.PROD as boolean, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 7 };
                    cookies.set('sb-access-token', session.access_token, opts);
                    cookies.set('sb-refresh-token', session.refresh_token, opts);
                    resolvedUser = rUser;
                    console.log('[middleware] Token renovado automáticamente para:', rUser.email);
                }
            }

            if (resolvedUser) {
                locals.user = resolvedUser;

                // Obtener rol desde la tabla users (busca por id primero, con fallback a email)
                let profile: { role: string } | null = null;

                const { data: byId } = await supabaseAdmin
                    .from("users")
                    .select("id, role")
                    .eq("id", resolvedUser.id)
                    .maybeSingle();

                if (byId) {
                    profile = byId;
                } else {
                    const { data: byEmail } = await supabaseAdmin
                        .from("users")
                        .select("id, role")
                        .eq("email", resolvedUser.email)
                        .maybeSingle();
                    profile = byEmail;
                }

                locals.role = profile?.role || "customer";
            }
        } catch (e) {
            console.error('[middleware] auth error', e);
        }
    }

    // 2. Comprobar modo mantenimiento
    // La fuente de verdad es la BD (site_settings key: 'maintenance').
    // La variable de entorno MAINTENANCE_MODE solo actúa como override de emergencia
    // cuando vale exactamente "true" (útil para forzar mantenimiento sin acceder al admin).
    let isMaintenanceMode = false;

    const envOverride = import.meta.env.MAINTENANCE_MODE ?? (typeof process !== 'undefined' ? process.env.MAINTENANCE_MODE : undefined);
    if (envOverride !== undefined && String(envOverride).trim().toLowerCase() === 'true') {
        // Hard override from env — maintenance forced ON regardless of DB
        isMaintenanceMode = true;
    } else {
        // Source of truth: DB
        try {
            const { data } = await supabaseAdmin
                .from('site_settings')
                .select('value')
                .eq('key', 'maintenance')
                .maybeSingle();
            if (data?.value) {
                const v = data.value;
                // value can be a JSONB object already parsed by Supabase client, or a string
                if (typeof v === 'object' && v !== null) {
                    isMaintenanceMode = !!v.enabled;
                } else {
                    try {
                        isMaintenanceMode = !!(JSON.parse(String(v))?.enabled);
                    } catch {
                        isMaintenanceMode = String(v).trim().toLowerCase() === 'true';
                    }
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
        !url.pathname.match(/\.(png|jpg|jpeg|svg|css|js|ico|xml|txt)$/)
    ) {
        return redirect('/maintenance', 302);
    }

    // Si NO estamos en mantenimiento, la URL /maintenance no debe ser accesible ni indexable.
    if (!isMaintenanceMode && url.pathname === '/maintenance') {
        return redirect('/', 302);
    }



    const response = await next();

    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // max-age=31536000 (1 año) + includeSubDomains + preload — cumple requisitos para HSTS Preload List
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    // payment=(self "https://js.stripe.com") — permite que el iframe de Stripe use la
    // Payment Request API (necesario para Apple Pay / Google Pay)
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")');
    response.headers.set(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            // data: es necesario para Astro ClientRouter (View Transitions) que inyecta
            // scripts como data:application/javascript URIs en runtime
            "script-src 'self' 'unsafe-inline' data: https://js.stripe.com https://challenges.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net https://upload-widget.cloudinary.com",
            "script-src-elem 'self' 'unsafe-inline' data: https://js.stripe.com https://challenges.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net https://upload-widget.cloudinary.com",
            "frame-src https://js.stripe.com https://challenges.cloudflare.com https://upload-widget.cloudinary.com",
            "connect-src 'self' https://api.stripe.com https://jboxsbtfhkanvnhxuxdd.supabase.co https://unpkg.com https://cdn.jsdelivr.net https://upload-widget.cloudinary.com https://api.cloudinary.com",
            "img-src 'self' data: https:",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "object-src 'none'",
            "base-uri 'self'",
            // Stripe usa Web Workers para criptografía del lado del cliente
            "worker-src blob:",
        ].join('; ')
    );

    // Doble señal anti-indexación para buscadores cuando la URL es /maintenance.
    if (url.pathname === '/maintenance') {
        response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    }

    return response;
});
