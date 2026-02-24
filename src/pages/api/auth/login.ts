/**
 * POST /api/auth/login
 *
 * Login de usuarios usando Supabase Auth con cookies httpOnly.
 *
 * Flujo:
 * 1. Validar email y password.
 * 2. Autenticar con supabase.auth.signInWithPassword.
 * 3. Establecer cookies seguras (sb-access-token, sb-refresh-token).
 * 4. Devolver respuesta exitosa sin exponer tokens en el JSON.
 */

import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

// ── Helper ─────────────────────────────────────────────────────────────────────

function jsonResponse(data: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ── Handler ────────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request, cookies }) => {
    try {
        const body = await request.json();
        const { email, password } = body as {
            email?: string;
            password?: string;
        };

        // 1. Validar campos obligatorios
        if (!email || !email.trim()) {
            return jsonResponse({ message: 'El email es obligatorio.' }, 400);
        }

        if (!password) {
            return jsonResponse({ message: 'La contraseña es obligatoria.' }, 400);
        }

        // 2. Autenticar con Supabase Auth (usando cliente normal)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });

        if (authError) {
            // No exponemos detalles del error de Supabase por seguridad
            console.warn('[login] Intento de login fallido:', authError.message);
            return jsonResponse({ message: 'Credenciales inválidas.' }, 401);
        }

        const { session, user } = authData;

        if (!session || !user) {
            return jsonResponse({ message: 'Error inesperado al iniciar sesión.' }, 500);
        }

        // 3. Configurar cookies httpOnly
        // sb-access-token: Token de acceso principal
        // sb-refresh-token: Para renovar la sesión
        const cookieOptions = {
            path: "/",
            httpOnly: true,
            secure: import.meta.env.PROD, // true en producción
            sameSite: "lax" as const,
            maxAge: 60 * 60 * 24 * 7, // 7 días (igual que la sesión típica)
        };

        cookies.set("sb-access-token", session.access_token, cookieOptions);
        cookies.set("sb-refresh-token", session.refresh_token, cookieOptions);

        // Opcional: Eliminar la cookie vieja si existe
        cookies.delete("auth_token", { path: "/" });

        console.log(`[login] Sesión iniciada para: ${user.email}`);

        // 4. Devolver éxito sin tokens en el cuerpo JSON
        return jsonResponse({
            message: 'Login exitoso.',
            user: {
                id: user.id,
                email: user.email,
                // Nota: Otros datos de perfil se obtendrán vía middleware o API de perfil
            }
        }, 200);

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.error('[login] Error crítico:', msg);
        return jsonResponse({ message: 'Error interno del servidor.' }, 500);
    }
};
