/**
 * POST /api/auth/update-password
 *
 * Actualiza la contraseña del usuario autenticado usando Supabase Auth Admin.
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

    let body: { password?: string; current_password?: string };
    try {
        body = await request.json();
    } catch {
        return json({ message: 'Cuerpo de la solicitud inválido.' }, 400);
    }

    const { password, current_password } = body;

    if (!current_password) {
        return json({ error: 'Debes introducir tu contraseña actual.' }, 400);
    }

    if (!password || password.length < 8) {
        return json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' }, 400);
    }

    // Verificar contraseña actual
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: current_password,
    });
    if (signInError) {
        return json({ error: 'La contraseña actual es incorrecta.' }, 400);
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });

    if (error) {
        console.error('[update-password]', error.message);
        return json({ error: 'Error al actualizar la contraseña.' }, 500);
    }

    return json({ ok: true, message: 'Contraseña actualizada correctamente.' });
};
