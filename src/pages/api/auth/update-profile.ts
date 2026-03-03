/**
 * POST /api/auth/update-profile
 *
 * Actualiza nombre y teléfono del usuario autenticado en la tabla `users`.
 */
import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '../../../lib/supabase';

function json(data: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const POST: APIRoute = async ({ request, cookies }) => {
    const accessToken =
        cookies.get('sb-access-token')?.value ||
        cookies.get('auth_token')?.value;

    if (!accessToken) return json({ message: 'No autenticado.' }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (!user || authError) return json({ message: 'Sesión inválida.' }, 401);

    let body: { name?: string; phone?: string };
    try {
        body = await request.json();
    } catch {
        return json({ message: 'Cuerpo de la solicitud inválido.' }, 400);
    }

    const { name, phone } = body;

    if (!name?.trim()) {
        return json({ message: 'El nombre es obligatorio.' }, 400);
    }

    const { error } = await supabaseAdmin
        .from('users')
        .update({
            name: name.trim(),
            phone: phone?.trim() || null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

    if (error) {
        console.error('[update-profile]', error.message);
        return json({ message: 'Error al actualizar el perfil.' }, 500);
    }

    return json({ message: 'Perfil actualizado correctamente.' });
};
