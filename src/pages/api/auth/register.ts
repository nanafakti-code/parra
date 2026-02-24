/**
 * POST /api/auth/register
 *
 * Registro de usuarios usando Supabase Auth.
 *
 * Flujo:
 * 1. Validar campos obligatorios (name, email, password).
 * 2. Crear usuario en Supabase Auth con supabase.auth.signUp.
 * 3. Crear registro en tabla `users` con el mismo id de Auth.
 * 4. NO almacena password en tabla users (Supabase Auth lo gestiona).
 * 5. NO usa bcrypt, jsonwebtoken ni cookies manuales.
 */

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';

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
        const body = await request.json();
        const { name, email, password } = body as {
            name?: string;
            email?: string;
            password?: string;
        };

        // 1. Validar campos obligatorios
        if (!name || !name.trim()) {
            return jsonResponse({ message: 'El nombre es obligatorio.' }, 400);
        }

        if (!email || !email.trim()) {
            return jsonResponse({ message: 'El email es obligatorio.' }, 400);
        }

        if (!password || password.length < 6) {
            return jsonResponse({ message: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
        }

        // 2. Crear usuario en Supabase Auth usando la API de Admin
        // Usamos admin.createUser para evitar problemas de confirmación por email y sesiones
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email.trim(),
            password,
            email_confirm: true, // Auto-confirmar email
        });

        if (authError) {
            console.error('[register] Supabase Auth admin error:', authError.message);

            // Detectar email duplicado
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

        // 3. Crear registro en tabla users con el mismo id de Auth
        const { error: profileError } = await supabaseAdmin
            .from('users')
            .insert({
                id: authUser.id,
                name: name.trim(),
                email: email.trim(),
                role: 'customer',
            });

        if (profileError) {
            console.error('[register] Error al crear perfil:', profileError.message);

            // Intentar limpiar el usuario de Auth si falla la creación del perfil
            await supabaseAdmin.auth.admin.deleteUser(authUser.id).catch(() => {
                console.error('[register] No se pudo limpiar el usuario de Auth tras fallo en perfil.');
            });

            // Detectar email duplicado en tabla users
            if (profileError.code === '23505') {
                return jsonResponse({ message: 'Este email ya está registrado.' }, 400);
            }

            return jsonResponse({
                message: 'Error al crear el perfil: ' + profileError.message,
                debug: profileError
            }, 500);
        }

        console.log(`[register] Usuario creado: ${authUser.id} (${email})`);

        return jsonResponse({
            message: 'Cuenta creada correctamente.',
            user: {
                id: authUser.id,
                name: name.trim(),
                email: email.trim(),
            },
        }, 201);

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error interno';
        console.error('[register] Error:', msg);
        return jsonResponse({ message: 'Error interno del servidor.' }, 500);
    }
};
