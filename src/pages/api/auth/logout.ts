/**
 * POST /api/auth/logout
 * 
 * Cierra la sesión del usuario eliminando las cookies de Supabase.
 */

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ cookies }) => {
    // Eliminar las nuevas cookies de Supabase Auth
    cookies.delete('sb-access-token', { path: '/' });
    cookies.delete('sb-refresh-token', { path: '/' });

    // Eliminar la cookie vieja por si acaso
    cookies.delete('auth_token', { path: '/' });

    return new Response(JSON.stringify({
        message: 'Sesión cerrada correctamente.'
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};
