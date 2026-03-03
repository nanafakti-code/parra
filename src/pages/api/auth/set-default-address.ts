import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "No autenticado" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    let body: { address_id?: string };
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: "Cuerpo inválido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const { address_id } = body;
    if (!address_id) {
        return new Response(JSON.stringify({ error: "address_id requerido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Verificar que la dirección pertenece al usuario
    const { data: addr, error: fetchErr } = await supabaseAdmin
        .from("addresses")
        .select("id")
        .eq("id", address_id)
        .eq("user_id", user.id)
        .single();

    if (fetchErr || !addr) {
        return new Response(JSON.stringify({ error: "Dirección no encontrada" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Quitar is_default de todas las del usuario
    const { error: clearErr } = await supabaseAdmin
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", user.id);

    if (clearErr) {
        return new Response(JSON.stringify({ error: clearErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Establecer la nueva predeterminada
    const { error: updateErr } = await supabaseAdmin
        .from("addresses")
        .update({ is_default: true })
        .eq("id", address_id);

    if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};
