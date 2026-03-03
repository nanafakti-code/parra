import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { validateAdminAPI, jsonResponse, logAdminAction } from '../../../lib/admin';

/** GET /api/admin/coupons */
export const GET: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;

    const { data, error } = await supabaseAdmin
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return jsonResponse({ error: 'Error al obtener cupones' }, 500);

    // Get usage counts
    const { data: usage } = await supabaseAdmin.from('coupon_usage').select('coupon_id');
    const usageMap: Record<string, number> = {};
    (usage || []).forEach((u: any) => { usageMap[u.coupon_id] = (usageMap[u.coupon_id] || 0) + 1; });

    const coupons = (data || []).map(c => ({ ...c, timesUsed: usageMap[c.id] || 0 }));

    return jsonResponse({ coupons });
};

/** POST /api/admin/coupons – Create coupon */
export const POST: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { code, type, value, minPurchase, maxUses, expiresAt, isActive } = body;

        if (!code?.trim() || !type || value === undefined) {
            return jsonResponse({ error: 'code, type y value son obligatorios' }, 400);
        }

        if (!['percentage', 'fixed'].includes(type)) {
            return jsonResponse({ error: 'Tipo debe ser percentage o fixed' }, 400);
        }

        const insertData: Record<string, any> = {
            code: code.trim().toUpperCase(),
            type,
            value: parseFloat(value),
            is_active: isActive !== false,
        };
        if (minPurchase) insertData.min_purchase = parseFloat(minPurchase);
        if (maxUses) insertData.max_uses = parseInt(maxUses);
        if (expiresAt) insertData.expires_at = expiresAt;

        const { data, error } = await supabaseAdmin.from('coupons').insert(insertData).select().single();
        if (error) {
            if (error.code === '23505') return jsonResponse({ error: 'Ya existe un cupón con ese código' }, 409);
            return jsonResponse({ error: 'Error al crear cupón' }, 500);
        }

        await logAdminAction(admin.id, 'create_coupon', 'coupon', data.id, { code: insertData.code }, request.headers.get('x-forwarded-for'));
        return jsonResponse({ coupon: data, message: 'Cupón creado' }, 201);
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};

/** PATCH /api/admin/coupons – Update coupon */
export const PATCH: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { couponId, ...updates } = body;
        if (!couponId) return jsonResponse({ error: 'couponId obligatorio' }, 400);

        const updateData: Record<string, any> = {};
        if (updates.code !== undefined) updateData.code = updates.code.trim().toUpperCase();
        if (updates.type !== undefined) updateData.type = updates.type;
        if (updates.value !== undefined) updateData.value = parseFloat(updates.value);
        if (updates.minPurchase !== undefined) updateData.min_purchase = updates.minPurchase ? parseFloat(updates.minPurchase) : null;
        if (updates.maxUses !== undefined) updateData.max_uses = updates.maxUses ? parseInt(updates.maxUses) : null;
        if (updates.expiresAt !== undefined) updateData.expires_at = updates.expiresAt || null;
        if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

        const { data, error } = await supabaseAdmin.from('coupons').update(updateData).eq('id', couponId).select().single();
        if (error) return jsonResponse({ error: 'Error al actualizar cupón' }, 500);

        await logAdminAction(admin.id, 'update_coupon', 'coupon', couponId, updateData, request.headers.get('x-forwarded-for'));
        return jsonResponse({ coupon: data, message: 'Cupón actualizado' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};

/** DELETE /api/admin/coupons – Delete coupon */
export const DELETE: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const url = new URL(request.url);
        const couponId = url.searchParams.get('id');
        if (!couponId) return jsonResponse({ error: 'id obligatorio' }, 400);

        const { error } = await supabaseAdmin.from('coupons').delete().eq('id', couponId);
        if (error) return jsonResponse({ error: 'Error al eliminar cupón' }, 500);

        await logAdminAction(admin.id, 'delete_coupon', 'coupon', couponId, {}, request.headers.get('x-forwarded-for'));
        return jsonResponse({ message: 'Cupón eliminado' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};
