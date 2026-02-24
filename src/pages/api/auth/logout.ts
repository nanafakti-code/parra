/**
 * POST /api/auth/logout
 * 
 * Cierra la sesión del usuario eliminando las cookies de Supabase.
 */

import type { APIRoute } from 'astro';

export const ALL: APIRoute = async ({ cookies, redirect }) => {
    // Eliminar las cookies de sesión
    cookies.delete('sb-access-token', { path: '/' });
    cookies.delete('sb-refresh-token', { path: '/' });
    cookies.delete('auth_token', { path: '/' });

    // Si es una petición GET (ej: desde un enlace o window.location), redirigir al inicio
    return redirect('/', 302);
};
