import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { verifyToken } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
    const token = cookies.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });

    const payload: any = verifyToken(token);
    if (!payload) return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });

    try {
        // Get user's cart with items
        const { data: cart } = await supabase
            .from('carts')
            .select('*')
            .eq('user_id', payload.userId)
            .single();

        if (!cart) {
            return new Response(JSON.stringify({ message: 'Cart is empty' }), { status: 400 });
        }

        const { data: cartItems } = await supabase
            .from('cart_items')
            .select('*, products(*)')
            .eq('cart_id', cart.id);

        if (!cartItems || cartItems.length === 0) {
            return new Response(JSON.stringify({ message: 'Cart is empty' }), { status: 400 });
        }

        const total = cartItems.reduce((sum: number, item: any) => sum + (item.products.price * item.quantity), 0);

        // Create order
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                user_id: payload.userId,
                total,
                status: 'PENDING',
            })
            .select()
            .single();

        if (orderError || !order) {
            return new Response(JSON.stringify({ message: 'Failed to create order' }), { status: 500 });
        }

        // Create order items
        const orderItems = cartItems.map((item: any) => ({
            order_id: order.id,
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.products.price,
        }));

        await supabase.from('order_items').insert(orderItems);

        // Clear cart items
        await supabase.from('cart_items').delete().eq('cart_id', cart.id);

        return new Response(JSON.stringify({ message: 'Order created', orderId: order.id }), { status: 201 });
    } catch (error) {
        return new Response(JSON.stringify({ message: 'Internal Server Error' }), { status: 500 });
    }
};
