/**
 * POST /api/cart/merge
 * Fusiona las reservas de una sesión invitada con la sesión del usuario autenticado.
 * Se llama una vez después de un login exitoso.
 */

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json().catch(() => null);
        if (!body) {
            return new Response(JSON.stringify({ error: 'Cuerpo inválido' }), { status: 400 });
        }

        const { guestSessionId, userSessionId } = body;

        if (!guestSessionId || !userSessionId) {
            return new Response(
                JSON.stringify({ error: 'Se requieren guestSessionId y userSessionId' }),
                { status: 400 }
            );
        }

        if (guestSessionId === userSessionId) {
            return new Response(JSON.stringify({ success: true, merged: 0 }), { status: 200 });
        }

        // Usa la RPC atómica para transferir reservas
        const { error } = await supabaseAdmin.rpc('transfer_guest_cart_to_user', {
            p_guest_session_id: guestSessionId,
            p_user_session_id: userSessionId,
        });

        if (error) {
            console.error('[cart/merge] rpc error:', error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (err: any) {
        console.error('[cart/merge] unexpected error:', err);
        return new Response(JSON.stringify({
            error: 'Error interno del servidor',
            message: err.message,
            stack: err.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
