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
        // Invalidar sesión server-side para que el refresh token no pueda reutilizarse
        const accessToken = cookies.get('sb-access-token')?.value;
        if (accessToken) {
            try {
                const { data: { user } } = await supabase.auth.getUser(accessToken);
                if (user?.id) {
                    await supabaseAdmin.auth.admin.signOut(user.id);
                }
            } catch (err) {
                // No crítico — la limpieza de cookies es suficiente
                console.warn('[logout] No se pudo invalidar sesión server-side:', err);
            }
        }

        // Borrar cookies con las mismas opciones de path/sameSite/secure
        cookies.delete('sb-access-token', cookieOptions);
        cookies.delete('sb-refresh-token', cookieOptions);

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

// Compatibilidad GET: borrar cookies y redirigir al inicio
export const GET: APIRoute = async ({ cookies, redirect }) => {
    cookies.delete('sb-access-token', cookieOptions);
    cookies.delete('sb-refresh-token', cookieOptions);
    return redirect('/', 302);
};
