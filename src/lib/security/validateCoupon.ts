/**
 * validateCoupon — Server-side coupon validation.
 *
 * SECURITY: Always call this on the server. Never accept coupon discount
 * values from the client; only accept the coupon code (string).
 *
 * The function:
 *  1. Looks up the coupon by code using supabaseAdmin (bypasses RLS).
 *  2. Validates: active, not expired, max_uses not exceeded, min_purchase met.
 *  3. If is_exclusive=true, verifies the userId is in coupon_user_allowlist.
 *  4. Per-user check: each logged-in user can only use a given coupon once.
 *  5. Computes the discount amount server-side.
 */

import { supabaseAdmin } from '../supabase';

export interface ValidCoupon {
    id: string;
    code: string;
    type: 'percentage' | 'fixed';
    value: number;
}

export type CouponValidationResult =
    | { valid: true; coupon: ValidCoupon; discountAmount: number }
    | { valid: false; error: string };

export async function validateCoupon(
    couponCode: string,
    subtotal: number,
    userId?: string | null,
): Promise<CouponValidationResult> {
    // Basic input guard — never trust input length/type from outside
    if (!couponCode || typeof couponCode !== 'string' || couponCode.length > 60) {
        return { valid: false, error: 'Código de cupón inválido.' };
    }

    const code = couponCode.trim().toUpperCase();

    const { data: coupon, error } = await supabaseAdmin
        .from('coupons')
        .select('id, code, type, value, is_active, expires_at, max_uses, min_purchase, is_exclusive')
        .eq('code', code)
        .maybeSingle();

    if (error || !coupon) {
        return { valid: false, error: 'Cupón no encontrado.' };
    }

    if (!coupon.is_active) {
        return { valid: false, error: 'Este cupón no está activo.' };
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return { valid: false, error: 'Este cupón ha expirado.' };
    }

    // Check global usage limit (atomic check also happens inside the SQL RPC)
    if (coupon.max_uses !== null) {
        const { count } = await supabaseAdmin
            .from('coupon_usage')
            .select('*', { count: 'exact', head: true })
            .eq('coupon_id', coupon.id);

        if ((count ?? 0) >= coupon.max_uses) {
            return { valid: false, error: 'Este cupón ha alcanzado su límite de uso.' };
        }
    }

    // Exclusive coupon: check the user allowlist
    if (coupon.is_exclusive) {
        if (!userId) {
            return { valid: false, error: 'Este cupón es exclusivo. Debes iniciar sesión para usarlo.' };
        }

        const { data: entry } = await supabaseAdmin
            .from('coupon_user_allowlist')
            .select('id')
            .eq('coupon_id', coupon.id)
            .eq('user_id', userId)
            .maybeSingle();

        if (!entry) {
            return { valid: false, error: 'Este cupón no está disponible para tu cuenta.' };
        }
    }

    // Per-user usage check: each logged-in user can only use a coupon once
    if (userId) {
        const { count: userCount } = await supabaseAdmin
            .from('coupon_usage')
            .select('*', { count: 'exact', head: true })
            .eq('coupon_id', coupon.id)
            .eq('user_id', userId);

        if ((userCount ?? 0) > 0) {
            return { valid: false, error: 'Ya has utilizado este cupón anteriormente.' };
        }
    }

    const minPurchase: number = coupon.min_purchase ?? 0;
    if (subtotal < minPurchase) {
        return {
            valid: false,
            error: `El pedido mínimo para este cupón es ${minPurchase.toFixed(2)}€.`,
        };
    }

    // Compute discount server-side — NEVER trust a value from the client
    let discountAmount: number;
    if (coupon.type === 'percentage') {
        discountAmount = Math.round(subtotal * (coupon.value / 100) * 100) / 100;
    } else {
        // fixed: cannot discount more than the subtotal
        discountAmount = Math.min(coupon.value, subtotal);
    }

    return {
        valid: true,
        coupon: {
            id: coupon.id,
            code: coupon.code,
            type: coupon.type as 'percentage' | 'fixed',
            value: coupon.value,
        },
        discountAmount,
    };
}
