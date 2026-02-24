import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/**
 * GET /api/cart
 * Obtiene el carrito del usuario autenticado.
 */
export const GET: APIRoute = async ({ locals }) => {
    const user = locals.user;

    // Si no hay usuario, devolvemos vacío (el frontend maneja localStorage para invitados)
    if (!user) {
        return new Response(JSON.stringify([]), { status: 200 });
    }

    // 1. Buscar el carrito del usuario
    const { data: cart } = await supabase
        .from('carts')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (!cart) {
        return new Response(JSON.stringify([]), { status: 200 });
    }

    // 2. Obtener items con info de producto
    const { data: items } = await supabase
        .from('cart_items')
        .select('*, products(*)')
        .eq('cart_id', cart.id);

    const formatted = (items || []).map((item: any) => ({
        ...item,
        product: item.products,
    }));

    return new Response(JSON.stringify(formatted), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};

/**
 * POST /api/cart
 * Añade un producto al carrito del usuario.
 */
export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user;

    if (!user) {
        return new Response(JSON.stringify({ message: 'No autorizado' }), { status: 401 });
    }

    const { productId, quantity } = await request.json();

    if (!productId || !quantity) {
        return new Response(JSON.stringify({ message: 'Faltan campos' }), { status: 400 });
    }

    // 1. Buscar o crear el carrito del usuario
    let { data: cart } = await supabase
        .from('carts')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (!cart) {
        const { data: newCart, error: createError } = await supabase
            .from('carts')
            .insert({ user_id: user.id })
            .select()
            .single();

        if (createError) {
            return new Response(JSON.stringify({ message: 'Error al crear carrito' }), { status: 500 });
        }
        cart = newCart;
    }

    if (!cart) {
        return new Response(JSON.stringify({ message: 'Error interno' }), { status: 500 });
    }

    // 2. Buscar si el item ya existe
    const { data: existingItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('cart_id', cart.id)
        .eq('product_id', productId)
        .single();

    if (existingItem) {
        // Incrementar cantidad
        await supabase
            .from('cart_items')
            .update({ quantity: existingItem.quantity + quantity })
            .eq('id', existingItem.id);
    } else {
        // Insertar nuevo item
        await supabase
            .from('cart_items')
            .insert({
                cart_id: cart.id,
                product_id: productId,
                quantity
            });
    }

    return new Response(JSON.stringify({ message: 'Producto añadido' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};
