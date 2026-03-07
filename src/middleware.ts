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
    // 1. Comprobar modo mantenimiento desde site_settings en Supabase
    const url = new URL(request.url);
    let isMaintenanceMode = false;

    // In production, check maintenance mode from DB (skip in local dev)
    if (import.meta.env.PROD) {
        try {
            const { data, error } = await supabaseAdmin
                .from('site_settings')
                .select('value')
                .eq('key', 'maintenance_mode')
                .maybeSingle();
            if (error) {
                console.error('[middleware] Error reading maintenance_mode:', error.message);
            }
            const val = data?.value;
            isMaintenanceMode = val === true || val === 'true';
        } catch (e) {
            console.error('[middleware] Exception reading maintenance_mode:', e);
        }
    }

    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (
        isMaintenanceMode &&
        pathname !== '/maintenance' &&
        !pathname.startsWith('/admin') &&
        !pathname.startsWith('/_astro') &&
        !pathname.startsWith('/api') &&
        !pathname.match(/\.(png|jpg|jpeg|svg|css|js|ico)$/)
    ) {
        return redirect('/maintenance', 302);
    }

    // 2. Obtener access_token desde cookies
    // Usamos 'sb-access-token' como nombre predeterminado de Supabase
    let accessToken = cookies.get("sb-access-token")?.value || cookies.get("auth_token")?.value;
    const refreshToken = cookies.get("sb-refresh-token")?.value;

    locals.user = null;
    locals.role = null;

    if (accessToken) {
        // 3. Validar usuario con Supabase Auth (sin usar admin para este paso)
        let { data: { user }, error } = await supabase.auth.getUser(accessToken);

        // Si el token expiró, intentar refresh
        if ((!user || error) && refreshToken) {
            try {
                const { data: refreshData, error: refreshError } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                });

                if (refreshData?.session && !refreshError) {
                    const cookieOptions = {
                        path: '/',
                        httpOnly: true,
                        secure: import.meta.env.PROD,
                        sameSite: 'lax' as const,
                        maxAge: 60 * 60 * 24 * 7,
                    };
                    cookies.set('sb-access-token', refreshData.session.access_token, cookieOptions);
                    cookies.set('sb-refresh-token', refreshData.session.refresh_token, cookieOptions);

                    user = refreshData.session.user;
                    error = null;
                }
            } catch (e) {
                // Si falla el refresh, continuamos sin usuario
            }
        }

        if (user && !error) {
            locals.user = user;

            // 4. Obtener rol desde la tabla users (busca por id primero, con fallback a email)
            let profile: { role: string } | null = null;

            const { data: byId } = await supabaseAdmin
                .from("users")
                .select("id, role")
                .eq("id", user.id)
                .maybeSingle();

            if (byId) {
                profile = byId;
            } else {
                // Fallback: el UUID de Auth puede no coincidir con public.users (usuario creado manualmente)
                const { data: byEmail } = await supabaseAdmin
                    .from("users")
                    .select("id, role")
                    .eq("email", user.email)
                    .maybeSingle();
                profile = byEmail;
            }

            locals.role = profile?.role || "customer";
        }
    }

    return next();
});
