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

    // Usage counts
    const { data: usage } = await supabaseAdmin.from('coupon_usage').select('coupon_id');
    const usageMap: Record<string, number> = {};
    (usage || []).forEach((u: any) => { usageMap[u.coupon_id] = (usageMap[u.coupon_id] || 0) + 1; });

    // Allowed users for exclusive coupons
    const { data: allowlist } = await supabaseAdmin
        .from('coupon_user_allowlist')
        .select('coupon_id, user_id, users!inner(id, name, email)');

    const allowlistMap: Record<string, { id: string; name: string; email: string }[]> = {};
    (allowlist || []).forEach((entry: any) => {
        if (!allowlistMap[entry.coupon_id]) allowlistMap[entry.coupon_id] = [];
        allowlistMap[entry.coupon_id].push({
            id:    entry.users.id,
            name:  entry.users.name,
            email: entry.users.email,
        });
    });

    const coupons = (data || []).map((c: any) => ({
        ...c,
        timesUsed:    usageMap[c.id] || 0,
        allowedUsers: allowlistMap[c.id] || [],
    }));

    return jsonResponse({ coupons });
};

/** POST /api/admin/coupons – Create coupon */
export const POST: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const body = await request.json();
        const { code, type, value, minPurchase, maxUses, expiresAt, isActive, isExclusive, allowedUsers } = body;

        if (!code?.trim() || !type || value === undefined) {
            return jsonResponse({ error: 'code, type y value son obligatorios' }, 400);
        }

        if (!['percentage', 'fixed'].includes(type)) {
            return jsonResponse({ error: 'Tipo debe ser percentage o fixed' }, 400);
        }

        const insertData: Record<string, any> = {
            code:      code.trim().toUpperCase(),
            type,
            value:     parseFloat(value),
            is_active: isActive !== false,
        };
        if (isExclusive === true) insertData.is_exclusive = true;
        if (minPurchase)          insertData.min_purchase = parseFloat(minPurchase);
        if (maxUses)              insertData.max_uses     = parseInt(maxUses);
        if (expiresAt)            insertData.expires_at   = expiresAt;

        const { data, error } = await supabaseAdmin
            .from('coupons')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            console.error('[POST /api/admin/coupons]', error);
            if (error.code === '23505') return jsonResponse({ error: 'Ya existe un cupón con ese código' }, 409);
            if (error.code === '42703' || error.message?.includes('is_exclusive')) {
                return jsonResponse({ error: 'Migración pendiente: ejecuta database/migrations/exclusive-coupons.sql en tu base de datos Supabase.' }, 500);
            }
            return jsonResponse({ error: `Error al crear cupón: ${error.message}` }, 500);
        }

        // Set allowlist for exclusive coupons
        if (isExclusive && Array.isArray(allowedUsers) && allowedUsers.length > 0) {
            const rows = allowedUsers.map((uid: string) => ({ coupon_id: data.id, user_id: uid }));
            const { error: allowlistError } = await supabaseAdmin.from('coupon_user_allowlist').insert(rows);
            if (allowlistError) console.error('[POST /api/admin/coupons] allowlist insert:', allowlistError);
        }

        await logAdminAction(
            admin.id, 'create_coupon', 'coupon', data.id,
            { code: insertData.code, is_exclusive: isExclusive },
            request.headers.get('x-forwarded-for') || undefined,
        );
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
        const { couponId, allowedUsers, ...updates } = body;
        if (!couponId) return jsonResponse({ error: 'couponId obligatorio' }, 400);

        const updateData: Record<string, any> = {};
        if (updates.code        !== undefined) updateData.code         = updates.code.trim().toUpperCase();
        if (updates.type        !== undefined) updateData.type         = updates.type;
        if (updates.value       !== undefined) updateData.value        = parseFloat(updates.value);
        if (updates.minPurchase !== undefined) updateData.min_purchase = updates.minPurchase ? parseFloat(updates.minPurchase) : null;
        if (updates.maxUses     !== undefined) updateData.max_uses     = updates.maxUses ? parseInt(updates.maxUses) : null;
        if (updates.expiresAt   !== undefined) updateData.expires_at   = updates.expiresAt || null;
        if (updates.isActive    !== undefined) updateData.is_active    = updates.isActive;
        // is_exclusive requires migration — only set if explicitly provided
        if (updates.isExclusive !== undefined) updateData.is_exclusive = updates.isExclusive;

        const { data, error } = await supabaseAdmin
            .from('coupons')
            .update(updateData)
            .eq('id', couponId)
            .select()
            .single();

        if (error) {
            console.error('[PATCH /api/admin/coupons]', error);
            if (error.message?.includes('is_exclusive')) {
                return jsonResponse({ error: 'La migración de cupones exclusivos aún no se ha ejecutado en la base de datos. Ejecuta database/migrations/exclusive-coupons.sql en Supabase.' }, 500);
            }
            return jsonResponse({ error: `Error al actualizar cupón: ${error.message}` }, 500);
        }

        // Replace allowlist when allowedUsers array is provided
        if (Array.isArray(allowedUsers)) {
            const { error: delErr } = await supabaseAdmin.from('coupon_user_allowlist').delete().eq('coupon_id', couponId);
            if (delErr) console.error('[PATCH /api/admin/coupons] allowlist delete:', delErr);
            if (allowedUsers.length > 0) {
                const rows = allowedUsers.map((uid: string) => ({ coupon_id: couponId, user_id: uid }));
                await supabaseAdmin.from('coupon_user_allowlist').insert(rows);
            }
        }

        await logAdminAction(
            admin.id, 'update_coupon', 'coupon', couponId,
            updateData,
            request.headers.get('x-forwarded-for') || undefined,
        );
        return jsonResponse({ coupon: data, message: 'Cupón actualizado' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};

/** DELETE /api/admin/coupons – Delete coupon (allowlist entries cascade) */
export const DELETE: APIRoute = async ({ request, cookies }) => {
    const result = await validateAdminAPI(request, cookies);
    if (result instanceof Response) return result;
    const { admin } = result;

    try {
        const url = new URL(request.url);
        const couponId = url.searchParams.get('id');
        if (!couponId) return jsonResponse({ error: 'id obligatorio' }, 400);

        // Delete usage records first (coupon_usage may not have ON DELETE CASCADE)
        await supabaseAdmin.from('coupon_usage').delete().eq('coupon_id', couponId);

        const { error } = await supabaseAdmin.from('coupons').delete().eq('id', couponId);
        if (error) return jsonResponse({ error: `Error al eliminar cupón: ${error.message}` }, 500);

        await logAdminAction(
            admin.id, 'delete_coupon', 'coupon', couponId,
            {},
            request.headers.get('x-forwarded-for') || undefined,
        );
        return jsonResponse({ message: 'Cupón eliminado' });
    } catch (err) {
        return jsonResponse({ error: 'Error interno' }, 500);
    }
};
