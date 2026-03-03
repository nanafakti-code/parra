import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse, logAdminAction } from '../../../lib/admin';

/** GET /api/admin/categories */
export const GET: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;

    const { data, error } = await supabaseAdmin
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });

    if (error) return jsonResponse({ error: 'Error al obtener categorías' }, 500);

    // Product counts per category
    const { data: products } = await supabaseAdmin.from('products').select('category_id').eq('is_active', true);
    const countMap: Record<string, number> = {};
    (products || []).forEach((p: any) => {
        if (p.category_id) countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
    });

    const categories = (data || []).map(c => ({ ...c, productCount: countMap[c.id] || 0 }));
    return jsonResponse({ categories });
};

/** POST /api/admin/categories */
export const POST: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { name, slug, description, imageUrl, displayOrder, isActive } = body;

        if (!name?.trim() || !slug?.trim()) return jsonResponse({ error: 'name y slug obligatorios' }, 400);

        const { data, error } = await supabaseAdmin.from('categories').insert({
            name: name.trim(),
            slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            description: description || null,
            image_url: imageUrl || null,
            display_order: displayOrder || 0,
            is_active: isActive !== false,
        }).select().single();

        if (error) {
            if (error.code === '23505') return jsonResponse({ error: 'Ya existe una categoría con ese nombre/slug' }, 409);
            return jsonResponse({ error: 'Error al crear categoría' }, 500);
        }

        await logAdminAction(admin.id, 'create_category', 'category', data.id, { name: data.name }, request.headers.get('x-forwarded-for'));
        return jsonResponse({ category: data, message: 'Categoría creada' }, 201);
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};

/** PATCH /api/admin/categories */
export const PATCH: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { categoryId, ...updates } = body;
        if (!categoryId) return jsonResponse({ error: 'categoryId obligatorio' }, 400);

        const updateData: Record<string, any> = {};
        if (updates.name !== undefined) updateData.name = updates.name.trim();
        if (updates.slug !== undefined) updateData.slug = updates.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
        if (updates.description !== undefined) updateData.description = updates.description || null;
        if (updates.imageUrl !== undefined) updateData.image_url = updates.imageUrl || null;
        if (updates.displayOrder !== undefined) updateData.display_order = parseInt(updates.displayOrder);
        if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

        const { data, error } = await supabaseAdmin.from('categories').update(updateData).eq('id', categoryId).select().single();
        if (error) return jsonResponse({ error: 'Error al actualizar categoría' }, 500);

        await logAdminAction(admin.id, 'update_category', 'category', categoryId, updateData, request.headers.get('x-forwarded-for'));
        return jsonResponse({ category: data, message: 'Categoría actualizada' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};

/** DELETE /api/admin/categories?id=... */
export const DELETE: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    const url = new URL(request.url);
    const categoryId = url.searchParams.get('id');
    if (!categoryId) return jsonResponse({ error: 'id obligatorio' }, 400);

    const { error } = await supabaseAdmin.from('categories').update({ is_active: false }).eq('id', categoryId);
    if (error) return jsonResponse({ error: 'Error al eliminar categoría' }, 500);

    await logAdminAction(admin.id, 'delete_category', 'category', categoryId, {}, request.headers.get('x-forwarded-for'));
    return jsonResponse({ message: 'Categoría desactivada' });
};
