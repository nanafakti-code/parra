/**
 * POST /api/auth/register
 *
 * Registro de usuarios usando Supabase Auth.
 *
 * Flujo:
 * 1. Validar campos obligatorios (name, email, password).
 * 2. Crear usuario en Supabase Auth (admin.createUser).
 * 3. Crear registro en tabla `users` (id, name, email, phone, role).
 * 4. Opcional: crear registro en tabla `addresses` si se envía dirección.
 * 5. Limpieza en cascada si algún paso falla.
 */

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AddressInput {
    full_name?: string;
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    phone?: string;
    label?: string;
    is_default?: boolean;
}

interface RegisterBody {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    address?: AddressInput;
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function jsonResponse(data: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ── Handler ────────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json() as RegisterBody;
        const { name, email, phone, password, address } = body;

        // 1. Validar campos obligatorios
        if (!name || !name.trim()) {
            return jsonResponse({ message: 'El nombre es obligatorio.' }, 400);
        }

        if (!email || !email.trim()) {
            return jsonResponse({ message: 'El email es obligatorio.' }, 400);
        }

        if (!password || password.length < 8) {
            return jsonResponse({ message: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
        }

        // 2. Crear usuario en Supabase Auth usando la API de Admin
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email.trim(),
            password,
            email_confirm: true,
        });

        if (authError) {
            console.error('[register] Supabase Auth admin error:', authError.message);

            if (authError.message.includes('already registered') || authError.message.includes('already been registered') || authError.code === '422') {
                return jsonResponse({ message: 'Este email ya está registrado.' }, 400);
            }

            return jsonResponse({
                message: 'Error de Supabase Auth: ' + authError.message,
                debug: authError
            }, 500);
        }

        const authUser = authData.user;
        if (!authUser) {
            console.error('[register] Supabase Auth devolvió null en user.');
            return jsonResponse({ message: 'Error inesperado al crear la cuenta.' }, 500);
        }

        // 3. Crear registro en tabla users (incluye phone)
        const { error: profileError } = await supabaseAdmin
            .from('users')
            .insert({
                id:    authUser.id,
                name:  name.trim(),
                email: email.trim(),
                role:  'customer',
                phone: phone?.trim() || null,
            });

        if (profileError) {
            console.error('[register] Error al crear perfil:', profileError.message);

            await supabaseAdmin.auth.admin.deleteUser(authUser.id).catch(() => {
                console.error('[register] No se pudo limpiar el usuario de Auth tras fallo en perfil.');
            });

            if (profileError.code === '23505') {
                return jsonResponse({ message: 'Este email ya está registrado.' }, 400);
            }

            return jsonResponse({
                message: 'Error al crear el perfil: ' + profileError.message,
                debug: profileError
            }, 500);
        }

        // 4. Crear dirección si se proporcionó (opcional pero recomendado)
        if (address && address.full_name && address.street && address.city) {
            const { error: addrError } = await supabaseAdmin
                .from('addresses')
                .insert({
                    user_id:     authUser.id,
                    label:       address.label       || 'Casa',
                    full_name:   address.full_name.trim(),
                    street:      address.street.trim(),
                    city:        address.city.trim(),
                    state:       address.state?.trim()       || null,
                    postal_code: address.postal_code?.trim() || null,
                    country:     address.country?.trim()     || 'España',
                    phone:       address.phone?.trim()       || null,
                    is_default:  address.is_default ?? true,
                });

            if (addrError) {
                // No bloqueamos el registro por un fallo de dirección, solo lo registramos
                console.error('[register] Error al crear dirección (no crítico):', addrError.message);
            } else {
                console.log(`[register] Dirección creada para: ${authUser.id}`);
            }
        }

        console.log(`[register] Usuario creado: ${authUser.id} (${email})`);

        return jsonResponse({
            message: 'Cuenta creada correctamente.',
            user: {
                id:    authUser.id,
                name:  name.trim(),
                email: email.trim(),
            },
        }, 201);

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error interno';
        console.error('[register] Error:', msg);
        return jsonResponse({ message: 'Error interno del servidor.' }, 500);
    }
};
