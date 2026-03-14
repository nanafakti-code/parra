import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../lib/supabase";
import { generateInvoicePdf } from "../../../../lib/pdf";

export const GET: APIRoute = async ({ params, locals }) => {
    try {
        /* ───── 1. Auth ───── */
        const authUser = locals.user;
        if (!authUser) {
            return new Response("No autenticado", { status: 401 });
        }

        const orderId = params.orderId;
        if (!orderId) {
            return new Response("ID requerido", { status: 400 });
        }

        /* ───── 2. Perfil del usuario (email para ownership check) ───── */
        const { data: userProfile } = await supabaseAdmin
            .from("users")
            .select("email, full_name, phone")
            .eq("id", authUser.id)
            .maybeSingle();

        // Email del usuario: primero de auth, luego de profile, luego vacío
        const userEmail = (authUser.email || userProfile?.email || "").toLowerCase().trim();

        /* ───── 3. Obtener pedido CON verificación de propiedad en una sola query ───── */
        // Intentar por user_id primero (más seguro, sin interpolación de strings)
        let { data: order, error } = await supabaseAdmin
            .from("orders")
            .select("*, order_items(*, products(name, image))")
            .eq("id", orderId)
            .eq("user_id", authUser.id)
            .maybeSingle();

        // Si no se encontró por user_id, buscar por email (pedidos de invitado)
        // Se usan parámetros separados para evitar inyección de filtros PostgREST
        if (!order && userEmail) {
            const result = await supabaseAdmin
                .from("orders")
                .select("*, order_items(*, products(name, image))")
                .eq("id", orderId)
                .eq("email", userEmail)
                .maybeSingle();
            order = result.data;
            error = result.error;
        }

        console.log("[Invoice] userId:", authUser.id, "userEmail:", userEmail, "orderId:", orderId, "found:", !!order, "err:", error?.message);

        if (error || !order) {
            return new Response("Pedido no encontrado o acceso denegado", { status: 404 });
        }

        /* ───── 4. Generar PDF ───── */
        const pdfBuffer = await generateInvoicePdf(order, userProfile);
        const orderNumber = order.order_number || `EG-${String(order.id).slice(-8).toUpperCase()}`;

        /* ───── 5. Respuesta ───── */
        return new Response(new Uint8Array(pdfBuffer), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="factura-${orderNumber}.pdf"`,
                "Cache-Control": "private, max-age=300",
            },
        });

    } catch (err: any) {
        console.error("[Invoice] Error:", err?.message ?? err);
        return new Response(
            `Error al generar la factura: ${err?.message ?? "desconocido"}`,
            { status: 500, headers: { "Content-Type": "text/plain" } }
        );
    }
};
