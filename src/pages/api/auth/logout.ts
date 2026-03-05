/**
 * POST /api/auth/logout
 * 
 * Cierra la sesión del usuario eliminando las cookies de Supabase.
 */

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '../../../lib/supabase';

// Opciones de cookie idénticas a las usadas en /api/auth/login
const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax' as const,
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const POST: APIRoute = async ({ cookies, request, redirect }) => {
    try {
        // Intentar invalidar tokens server-side si podemos identificar al usuario
        const accessToken = cookies.get('sb-access-token')?.value || cookies.get('auth_token')?.value;
        if (accessToken) {
            try {
                const { data: userResult } = await supabase.auth.getUser(accessToken);
                const user = (userResult as any)?.user;
                if (user && user.id && supabaseAdmin?.auth?.admin?.invalidateUserRefreshTokens) {
                    // Invalida los refresh tokens del usuario (si la SDK lo soporta)
                    // Esto evita reuso de refresh tokens si existieran en otros clientes
                    try {
                        // @ts-ignore - método admin puede variar según versión
                        await supabaseAdmin.auth.admin.invalidateUserRefreshTokens(user.id);
                    } catch (err) {
                        // No crítico si falla; seguimos con la limpieza de cookies
                        console.warn('[logout] No se pudo invalidar refresh tokens:', err);
                    }
                }
            } catch (err) {
                // No crítico
            }
        }

        // Borrar cookies con las mismas opciones de path/sameSite/secure
        cookies.delete('sb-access-token', cookieOptions);
        cookies.delete('sb-refresh-token', cookieOptions);
        cookies.delete('auth_token', cookieOptions);

        // Si la petición proviene de un navegador (Accept incluye text/html), redirigimos al inicio
        const accept = request.headers.get('accept') || '';
        if (accept.includes('text/html')) {
            return redirect('/', 303);
        }

        return jsonResponse({ message: 'Sesión cerrada.' }, 200);
    } catch (err) {
        return jsonResponse({ message: 'Error al cerrar sesión.' }, 500);
    }
};

// Mantener compatibilidad con peticiones GET (enlaces directos)
export const GET: APIRoute = async ({ cookies, redirect }) => {
    cookies.delete('sb-access-token', cookieOptions);
    cookies.delete('sb-refresh-token', cookieOptions);
    cookies.delete('auth_token', cookieOptions);
    return redirect('/', 303);
};
