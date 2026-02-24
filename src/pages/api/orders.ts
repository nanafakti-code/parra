import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/**
 * POST /api/orders
 * Crea un nuevo pedido a partir del carrito del usuario autenticado.
 */
export const POST: APIRoute = async ({ locals }) => {
    const user = locals.user;

    if (!user) {
        return new Response(JSON.stringify({ message: 'No autorizado' }), { status: 401 });
    }

    try {
        // 1. Obtener el carrito del usuario con sus items
        const { data: cart } = await supabase
            .from('carts')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (!cart) {
            return new Response(JSON.stringify({ message: 'El carrito está vacío' }), { status: 400 });
        }

        const { data: cartItems } = await supabase
            .from('cart_items')
            .select('*, products(*)')
            .eq('cart_id', cart.id);

        if (!cartItems || cartItems.length === 0) {
            return new Response(JSON.stringify({ message: 'El carrito está vacío' }), { status: 400 });
        }

        // 2. Calcular el total del pedido
        const total = cartItems.reduce((sum: number, item: any) => {
            const price = item.products?.price || 0;
            return sum + (price * item.quantity);
        }, 0);

        // 3. Crear el pedido principal
        // Nota: Usamos status: 'pending' (o el que corresponda en el schema)
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                user_id: user.id,
                total,
                status: 'pending',
                email: user.email // Opcional: guardar el email del usuario en la orden
            })
            .select()
            .single();

        if (orderError || !order) {
            console.error('[orders] Error al crear pedido:', orderError?.message);
            return new Response(JSON.stringify({ message: 'Error al crear el pedido' }), { status: 500 });
        }

        // 4. Crear los items del pedido
        const orderItems = cartItems.map((item: any) => ({
            order_id: order.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.products?.price || 0,
            total_price: (item.products?.price || 0) * item.quantity
        }));

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems);

        if (itemsError) {
            console.error('[orders] Error al insertar items:', itemsError.message);
            // Podríamos implementar un rollback aquí si fuera necesario
        }

        // 5. Vaciar el carrito tras la compra exitosa
        await supabase
            .from('cart_items')
            .delete()
            .eq('cart_id', cart.id);

        return new Response(JSON.stringify({
            message: 'Pedido creado exitosamente',
            orderId: order.id
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('[orders] Error crítico:', error.message);
        return new Response(JSON.stringify({ message: 'Error interno del servidor' }), { status: 500 });
    }
};
