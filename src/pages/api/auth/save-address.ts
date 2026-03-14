/**
 * POST /api/auth/save-address
 *
 * Guarda una nueva dirección de envío para el usuario autenticado.
 * Si is_default = true, desmarca la dirección predeterminada anterior.
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

    let body: {
        label?: string;
        full_name?: string;
        street?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        phone?: string;
        is_default?: boolean;
    };
    try {
        body = await request.json();
    } catch {
        return json({ message: 'Cuerpo de la solicitud inválido.' }, 400);
    }

    const { label, full_name, street, city, state, postal_code, phone, is_default } = body;

    if (!full_name?.trim() || !street?.trim() || !city?.trim() || !postal_code?.trim()) {
        return json(
            { message: 'Nombre, dirección, ciudad y código postal son obligatorios.' },
            400,
        );
    }

    // Limitar número de direcciones por usuario (máximo 10)
    const { count: addressCount } = await supabaseAdmin
        .from('addresses')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

    if (addressCount !== null && addressCount >= 10) {
        return json({ message: 'Has alcanzado el límite máximo de direcciones (10).' }, 400);
    }

    // Si es default, quitar el flag de la dirección predeterminada anterior
    if (is_default) {
        await supabaseAdmin
            .from('addresses')
            .update({ is_default: false })
            .eq('user_id', user.id)
            .eq('is_default', true);
    }

    const { error } = await supabaseAdmin.from('addresses').insert({
        user_id:     user.id,
        label:       label?.trim() || 'Casa',
        full_name:   full_name.trim(),
        street:      street.trim(),
        city:        city.trim(),
        state:       state?.trim() || null,
        postal_code: postal_code.trim(),
        phone:       phone?.trim() || null,
        country:     'España',
        is_default:  is_default ?? false,
    });

    if (error) {
        console.error('[save-address]', error.message);
        return json({ message: 'Error al guardar la dirección.' }, 500);
    }

    return json({ message: 'Dirección guardada correctamente.' });
};
