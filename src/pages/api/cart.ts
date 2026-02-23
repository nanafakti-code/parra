import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { verifyToken } from '../../lib/auth';

export const GET: APIRoute = async ({ cookies }) => {
    const token = cookies.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify([]), { status: 200 });

    const payload: any = verifyToken(token);
    if (!payload) return new Response(JSON.stringify([]), { status: 401 });

    // Find user's cart
    const { data: cart } = await supabase
        .from('carts')
        .select('*')
        .eq('user_id', payload.userId)
        .single();

    if (!cart) return new Response(JSON.stringify([]), { status: 200 });

    // Get cart items with product info
    const { data: items } = await supabase
        .from('cart_items')
        .select('*, products(*)')
        .eq('cart_id', cart.id);

    const formatted = (items || []).map((item: any) => ({
        ...item,
        product: item.products,
    }));

    return new Response(JSON.stringify(formatted), { status: 200 });
};

export const POST: APIRoute = async ({ request, cookies }) => {
    const token = cookies.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });

    const payload: any = verifyToken(token);
    if (!payload) return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });

    const { productId, quantity } = await request.json();

    // Find or create cart
    let { data: cart } = await supabase
        .from('carts')
        .select('*')
        .eq('user_id', payload.userId)
        .single();

    if (!cart) {
        const { data: newCart } = await supabase
            .from('carts')
            .insert({ user_id: payload.userId })
            .select()
            .single();
        cart = newCart;
    }

    if (!cart) {
        return new Response(JSON.stringify({ message: 'Failed to create cart' }), { status: 500 });
    }

    // Check for existing item
    const { data: existingItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('cart_id', cart.id)
        .eq('product_id', productId)
        .single();

    if (existingItem) {
        await supabase
            .from('cart_items')
            .update({ quantity: existingItem.quantity + quantity })
            .eq('id', existingItem.id);
    } else {
        await supabase
            .from('cart_items')
            .insert({ cart_id: cart.id, product_id: productId, quantity });
    }

    return new Response(JSON.stringify({ message: 'Added to cart' }), { status: 200 });
};
