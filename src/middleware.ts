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
    const accessToken = cookies.get("sb-access-token")?.value || cookies.get("auth_token")?.value;

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

    // 2. Comprobar modo mantenimiento: consultar site_settings en la DB
    let isMaintenanceMode = false;

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



    return next();
});
