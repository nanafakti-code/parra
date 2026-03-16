import type { APIRoute } from 'astro';
import { validateCoupon } from '../../../lib/security/validateCoupon';

function json(data: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * GET /api/coupon/validate?code=XXX&subtotal=XX
 * Public endpoint — validates a coupon for a given subtotal and (optionally) user.
 * Used by the cart page to preview the discount before checkout.
 * The actual security validation happens again at create-payment-intent time.
 */
export const GET: APIRoute = async ({ request, locals }) => {
    const url = new URL(request.url);
    const code     = url.searchParams.get('code') ?? '';
    const subtotal = parseFloat(url.searchParams.get('subtotal') ?? '0');

    if (!code || isNaN(subtotal) || subtotal <= 0) {
        return json({ valid: false, error: 'Parámetros inválidos.' }, 400);
    }

    const userId = (locals as any).user?.id ?? null;
    const result = await validateCoupon(code, subtotal, userId);

    if (!result.valid) {
        return json({ valid: false, error: result.error });
    }

    return json({
        valid:          true,
        code:           result.coupon.code,
        discountAmount: result.discountAmount,
        type:           result.coupon.type,
        value:          result.coupon.value,
    });
};
