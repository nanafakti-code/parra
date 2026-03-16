import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse, logAdminAction } from '../../../lib/admin';

/** GET /api/admin/products?page=1&category=...&search=...&active=true */
export const GET: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;
    const category = url.searchParams.get('category');
    const search = url.searchParams.get('search')?.trim();
    const active = url.searchParams.get('active');

    let query = supabaseAdmin
        .from('products')
        .select('*, categories(name), product_variants(id, size, stock, is_active), product_images(id, url, alt_text, display_order)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (category) query = query.eq('category_id', category);
    if (search) query = query.ilike('name', `%${search}%`);
    if (active === 'true') query = query.eq('is_active', true);
    if (active === 'false') query = query.eq('is_active', false);

    const { data, count, error } = await query;
    if (error) return jsonResponse({ error: 'Error al obtener productos' }, 500);

    return jsonResponse({ products: data || [], total: count || 0, page, totalPages: Math.ceil((count || 0) / limit) });
};

/** POST /api/admin/products – Create product */
export const POST: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { name, slug, description, shortDescription, price, comparePrice, categoryId, image, stock, sku, brand, isFeatured, isActive, metaTitle, metaDescription, variants, gallery } = body;

        if (!name?.trim() || !slug?.trim() || !description?.trim() || !price || !image?.trim() || !sku?.trim()) {
            return jsonResponse({ error: 'name, slug, description, price, image, y sku son obligatorios' }, 400);
        }

        if (isFeatured) {
            const { count } = await supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).eq('is_featured', true);
            if ((count || 0) >= 4) {
                return jsonResponse({ error: 'Ya hay 4 productos destacados máximo.' }, 400);
            }
        }

        const productData: Record<string, any> = {
            name: name.trim(),
            slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            description: description.trim(),
            short_description: shortDescription || null,
            price: parseFloat(price),
            compare_price: comparePrice ? parseFloat(comparePrice) : null,
            category_id: categoryId || null,
            image: image.trim(),
            stock: parseInt(stock || '0'),
            sku: sku.trim(),
            brand: brand?.trim() || 'PARRA',
            is_featured: isFeatured || false,
            is_active: isActive !== false,
            meta_title: metaTitle || null,
            meta_description: metaDescription || null,
        };

        const { data: product, error } = await supabaseAdmin
            .from('products')
            .insert(productData)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') return jsonResponse({ error: 'Ya existe un producto con ese slug/SKU' }, 409);
            console.error('[admin-products] Insert error:', error);
            return jsonResponse({ error: 'Error al crear producto' }, 500);
        }

        // Create variants if provided
        if (variants && Array.isArray(variants) && variants.length > 0) {
            const variantRows = variants.map((v: any) => ({
                product_id: product.id,
                size: v.size,
                stock: parseInt(v.stock || '0'),
                sku: v.sku || null,
                price_override: v.priceOverride ? parseFloat(v.priceOverride) : null,
                is_active: v.isActive !== false,
            }));
            await supabaseAdmin.from('product_variants').insert(variantRows);
        }

        // Create gallery if provided
        if (gallery && Array.isArray(gallery) && gallery.length > 0) {
            const galleryRows = gallery.map((g: any, index: number) => ({
                product_id: product.id,
                url: g.url,
                alt_text: g.altText || null,
                display_order: index
            }));
            await supabaseAdmin.from('product_images').insert(galleryRows);
        }

        await logAdminAction(admin.id, 'create_product', 'product', product.id, { name: product.name }, request.headers.get('x-forwarded-for') || undefined);
        return jsonResponse({ product, message: 'Producto creado' }, 201);
    } catch (err) {
        console.error('[admin-products] Error:', err);
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};

/** PATCH /api/admin/products – Update product */
export const PATCH: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { productId, variants, gallery, ...updates } = body;
        if (!productId) return jsonResponse({ error: 'productId obligatorio' }, 400);

        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        if (updates.name !== undefined) updateData.name = updates.name.trim();
        if (updates.slug !== undefined) updateData.slug = updates.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
        if (updates.description !== undefined) updateData.description = updates.description;
        if (updates.shortDescription !== undefined) updateData.short_description = updates.shortDescription;
        if (updates.price !== undefined) updateData.price = parseFloat(updates.price);
        if (updates.comparePrice !== undefined) updateData.compare_price = updates.comparePrice ? parseFloat(updates.comparePrice) : null;
        if (updates.categoryId !== undefined) updateData.category_id = updates.categoryId || null;
        if (updates.image !== undefined) updateData.image = updates.image;
        if (updates.stock !== undefined) updateData.stock = parseInt(updates.stock);
        if (updates.sku !== undefined) updateData.sku = updates.sku.trim();
        if (updates.brand !== undefined) updateData.brand = updates.brand;
        if (updates.isFeatured !== undefined) {
            if (updates.isFeatured) {
                const { data: existing } = await supabaseAdmin.from('products').select('is_featured').eq('id', productId).single();
                if (!existing?.is_featured) {
                    const { count } = await supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).eq('is_featured', true);
                    if ((count || 0) >= 4) {
                        return jsonResponse({ error: 'Ya hay 4 productos destacados máximo.' }, 400);
                    }
                }
                updateData.is_featured = true;
            } else {
                updateData.is_featured = false;
            }
        }
        if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
        if (updates.metaTitle !== undefined) updateData.meta_title = updates.metaTitle;
        if (updates.metaDescription !== undefined) updateData.meta_description = updates.metaDescription;
        if (updates.displayOrder !== undefined) updateData.display_order = parseInt(updates.displayOrder);

        const { data, error } = await supabaseAdmin.from('products').update(updateData).eq('id', productId).select().single();
        if (error) return jsonResponse({ error: 'Error al actualizar producto' }, 500);

        // Update variants if provided
        if (variants && Array.isArray(variants)) {
            // Delete existing and recreate
            await supabaseAdmin.from('product_variants').delete().eq('product_id', productId);
            if (variants.length > 0) {
                const variantRows = variants.map((v: any) => ({
                    product_id: productId,
                    size: v.size,
                    stock: parseInt(v.stock || '0'),
                    sku: v.sku || null,
                    price_override: v.priceOverride ? parseFloat(v.priceOverride) : null,
                    is_active: v.isActive !== false,
                }));
                await supabaseAdmin.from('product_variants').insert(variantRows);
            }
        }

        // Update gallery if provided
        if (gallery && Array.isArray(gallery)) {
            await supabaseAdmin.from('product_images').delete().eq('product_id', productId);
            if (gallery.length > 0) {
                const galleryRows = gallery.map((g: any, index: number) => ({
                    product_id: productId,
                    url: g.url,
                    alt_text: g.altText || null,
                    display_order: index
                }));
                await supabaseAdmin.from('product_images').insert(galleryRows);
            }
        }

        await logAdminAction(admin.id, 'update_product', 'product', productId, updateData, request.headers.get('x-forwarded-for') || undefined);
        return jsonResponse({ product: data, message: 'Producto actualizado' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};

/** DELETE /api/admin/products?id=... */
export const DELETE: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    const url = new URL(request.url);
    const productId = url.searchParams.get('id');
    if (!productId) return jsonResponse({ error: 'id obligatorio' }, 400);

    // Hard delete
    const { error } = await supabaseAdmin.from('products').delete().eq('id', productId);
    if (error) return jsonResponse({ error: `Error al eliminar producto: ${error.message}` }, 500);

    await logAdminAction(admin.id, 'delete_product', 'product', productId, {}, request.headers.get('x-forwarded-for') || undefined);
    return jsonResponse({ message: 'Producto eliminado permanentemente' });
};

/** PUT /api/admin/products – Bulk reorder products */
export const PUT: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { orders } = body; // [{ id, display_order }]

        if (!Array.isArray(orders)) {
            return jsonResponse({ error: 'orders es requerido como array' }, 400);
        }

        for (const item of orders) {
            await supabaseAdmin
                .from('products')
                .update({ display_order: item.display_order, updated_at: new Date().toISOString() })
                .eq('id', item.id);
        }

        await logAdminAction(admin.id, 'reorder_products', 'products', undefined,
            { count: orders.length }, request.headers.get('x-forwarded-for') || undefined);

        return jsonResponse({ message: 'Orden de productos actualizado' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};
