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
export const onRequest = defineMiddleware(async ({ cookies, locals }, next) => {
    // 1. Obtener access_token desde cookies
    // Usamos 'sb-access-token' como nombre predeterminado de Supabase
    const accessToken = cookies.get("sb-access-token")?.value || cookies.get("auth_token")?.value;

    locals.user = null;
    locals.role = null;

    if (accessToken) {
        // 2. Validar usuario con Supabase Auth (sin usar admin para este paso)
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);

        if (user && !error) {
            locals.user = user;

            // 3. Obtener rol desde la tabla users (usando admin para saltar RLS en middleware)
            const { data: profile } = await supabaseAdmin
                .from("users")
                .select("role")
                .eq("id", user.id)
                .maybeSingle();

            locals.role = profile?.role || "customer";
        }
    }

    return next();
});
