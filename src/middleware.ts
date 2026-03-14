import { defineMiddleware } from "astro:middleware";
import { supabase, supabaseAdmin } from "./lib/supabase";

// ── Maintenance setting cache (TTL: 60 s) ────────────────────────────────
// Evita una consulta a BD en CADA petición. El modo mantenimiento cambia
// como mucho cada pocos minutos, así que 60 s de caché es seguro.
let _maintenanceCache: { value: boolean; ts: number } | null = null;
const MAINTENANCE_TTL = 60_000;

async function getMaintenanceSetting(): Promise<boolean> {
    // Override de emergencia vía variable de entorno
    const envOverride =
        import.meta.env.MAINTENANCE_MODE ??
        (typeof process !== "undefined" ? process.env.MAINTENANCE_MODE : undefined);
    if (envOverride !== undefined && String(envOverride).trim().toLowerCase() === "true") {
        return true;
    }

    const now = Date.now();
    if (_maintenanceCache && now - _maintenanceCache.ts < MAINTENANCE_TTL) {
        return _maintenanceCache.value;
    }

    try {
        const { data } = await supabaseAdmin
            .from("site_settings")
            .select("value")
            .eq("key", "maintenance")
            .maybeSingle();

        let enabled = false;
        if (data?.value) {
            const v = data.value;
            if (typeof v === "object" && v !== null) {
                enabled = !!v.enabled;
            } else {
                try {
                    enabled = !!(JSON.parse(String(v))?.enabled);
                } catch {
                    enabled = String(v).trim().toLowerCase() === "true";
                }
            }
        }
        _maintenanceCache = { value: enabled, ts: now };
        return enabled;
    } catch (e) {
        console.error("[middleware] error reading maintenance setting", e);
        return false;
    }
}

/**
 * Middleware de autenticación global para Astro SSR.
 *
 * Flujo optimizado:
 * 1. Lanza en paralelo: validación del token + consulta de mantenimiento.
 * 2. Si el token es válido, obtiene el rol del usuario (una sola query por ID).
 * 3. Aplica lógica de mantenimiento.
 */
export const onRequest = defineMiddleware(async ({ cookies, locals, request, redirect }, next) => {
    const url = new URL(request.url);

    const accessToken = cookies.get("sb-access-token")?.value;
    const refreshToken = cookies.get("sb-refresh-token")?.value;

    locals.user = null;
    locals.role = null;

    // ── Lanzar auth y mantenimiento en paralelo ──────────────────────────
    const [authResult, isMaintenanceMode] = await Promise.all([
        // Auth
        (async () => {
            if (!accessToken) return null;
            try {
                const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
                let resolvedUser = authData.user && !authError ? authData.user : null;

                // Si el token expiró, intentar renovar con refresh token
                if (!resolvedUser && refreshToken) {
                    const {
                        data: { session, user: rUser },
                        error: rErr,
                    } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
                    if (session && rUser && !rErr) {
                        const opts = {
                            path: "/",
                            httpOnly: true,
                            secure: import.meta.env.PROD as boolean,
                            sameSite: "lax" as const,
                            maxAge: 60 * 60 * 24 * 7,
                        };
                        cookies.set("sb-access-token", session.access_token, opts);
                        cookies.set("sb-refresh-token", session.refresh_token, opts);
                        resolvedUser = rUser;
                        console.log("[middleware] Token renovado automáticamente para:", rUser.email);
                    }
                }
                return resolvedUser;
            } catch (e) {
                console.error("[middleware] auth error", e);
                return null;
            }
        })(),
        // Mantenimiento (cacheado, ~0 ms si está en caché)
        getMaintenanceSetting(),
    ]);

    // ── Obtener rol del usuario (solo si está autenticado) ───────────────
    if (authResult) {
        locals.user = authResult;
        try {
            // Busca por id primero; fallback a email si el UUID de auth difiere del de la tabla users
            const { data: byId } = await supabaseAdmin
                .from("users")
                .select("id, role")
                .eq("id", authResult.id)
                .maybeSingle();

            if (byId) {
                locals.role = byId.role ?? "customer";
            } else if (authResult.email) {
                const { data: byEmail } = await supabaseAdmin
                    .from("users")
                    .select("id, role")
                    .eq("email", authResult.email)
                    .maybeSingle();
                locals.role = byEmail?.role ?? "customer";
            } else {
                locals.role = "customer";
            }
        } catch (e) {
            console.error("[middleware] role lookup error", e);
            locals.role = "customer";
        }
    }

    // ── Lógica de mantenimiento ──────────────────────────────────────────
    const isAdmin = locals.role === "admin";
    if (
        isMaintenanceMode &&
        !isAdmin &&
        url.pathname !== "/maintenance" &&
        !url.pathname.startsWith("/admin") &&
        !url.pathname.startsWith("/_astro") &&
        !url.pathname.startsWith("/api") &&
        !url.pathname.match(/\.(png|jpg|jpeg|svg|css|js|ico|xml|txt)$/)
    ) {
        return redirect("/maintenance", 302);
    }

    if (!isMaintenanceMode && url.pathname === "/maintenance") {
        return redirect("/", 302);
    }

    const response = await next();

    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload"
    );
    response.headers.set(
        "Permissions-Policy",
        'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")'
    );
    response.headers.set(
        "Content-Security-Policy",
        [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' data: https://js.stripe.com https://challenges.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net https://upload-widget.cloudinary.com",
            "script-src-elem 'self' 'unsafe-inline' data: https://js.stripe.com https://challenges.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net https://upload-widget.cloudinary.com",
            "frame-src https://js.stripe.com https://challenges.cloudflare.com https://upload-widget.cloudinary.com",
            "connect-src 'self' https://api.stripe.com https://jboxsbtfhkanvnhxuxdd.supabase.co https://unpkg.com https://cdn.jsdelivr.net https://upload-widget.cloudinary.com https://api.cloudinary.com",
            "img-src 'self' data: https:",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "object-src 'none'",
            "base-uri 'self'",
            "worker-src blob:",
        ].join("; ")
    );

    if (url.pathname === "/maintenance") {
        response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    }

    return response;
});
