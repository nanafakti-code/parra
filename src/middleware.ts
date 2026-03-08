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
    // 1. Comprobar modo mantenimiento (soporte para Vercel process.env y mayúsculas/minúsculas)
    const rawMaintenanceMode = import.meta.env.MAINTENANCE_MODE || (typeof process !== 'undefined' ? process.env.MAINTENANCE_MODE : false);
    const isMaintenanceMode = String(rawMaintenanceMode).trim().toLowerCase() === 'true';
    const url = new URL(request.url);

    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    if (
        isMaintenanceMode &&
        !isLocalhost &&
        url.pathname !== '/maintenance' &&
        !url.pathname.startsWith('/_astro') &&
        !url.pathname.startsWith('/api') &&
        !url.pathname.match(/\.(png|jpg|jpeg|svg|css|js|ico)$/)
    ) {
        return redirect('/maintenance', 302);
    }

    // 2. Obtener access_token desde cookies
    // Usamos 'sb-access-token' como nombre predeterminado de Supabase
    const accessToken = cookies.get("sb-access-token")?.value || cookies.get("auth_token")?.value;

    locals.user = null;
    locals.role = null;

    if (accessToken) {
        // 3. Validar usuario con Supabase Auth (sin usar admin para este paso)
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);

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
