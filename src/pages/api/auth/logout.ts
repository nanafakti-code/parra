/**
 * POST /api/auth/logout
 * 
 * Cierra la sesión del usuario eliminando las cookies de Supabase.
 */

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '../../../lib/supabase';

// Opciones de cookie DEBEN ser idénticas a las usadas en /api/auth/login
// (misma path + sameSite para que el browser elimine la cookie correctamente)
const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax' as const,   // ← debe coincidir con login.ts (era 'strict', bug)
};

export const POST: APIRoute = async ({ cookies, request }) => {
    // Invalidar sesión server-side para que el refresh token no pueda reutilizarse
    const accessToken = cookies.get('sb-access-token')?.value;
    if (accessToken) {
        try {
            const { data: { user } } = await supabase.auth.getUser(accessToken);
            if (user?.id) {
                // Revoca todas las sesiones del usuario en Supabase
                await supabaseAdmin.auth.admin.signOut(user.id);
            }
        } catch (err) {
            // No crítico — la eliminación de cookies es suficiente para el logout
            console.warn('[logout] No se pudo invalidar sesión server-side:', err);
        }
    }

    // Borrar cookies vía API de Astro
    cookies.delete('sb-access-token', cookieOptions);
    cookies.delete('sb-refresh-token', cookieOptions);

    // Belt-and-suspenders: también añadimos los headers Set-Cookie directamente
    // para garantizar el borrado independientemente del adaptador (Vercel edge, etc.)
    const secureFlag = import.meta.env.PROD ? '; Secure' : '';
    const cookieDeleteHeader = (name: string) =>
        `${name}=; Path=/; Max-Age=0; HttpOnly${secureFlag}; SameSite=Lax`;

    const response = new Response(JSON.stringify({ message: 'Sesión cerrada.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
    response.headers.append('Set-Cookie', cookieDeleteHeader('sb-access-token'));
    response.headers.append('Set-Cookie', cookieDeleteHeader('sb-refresh-token'));

    return response;
};


