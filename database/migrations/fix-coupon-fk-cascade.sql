-- Fix coupon FK constraints AND create a safe delete function
--
-- Run this once in the Supabase SQL Editor.

-- ── 1. Fix orders.coupon_id FK ────────────────────────────────────────────────
ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_coupon_id_fkey;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_coupon_id_fkey
    FOREIGN KEY (coupon_id)
    REFERENCES public.coupons(id)
    ON DELETE SET NULL;

-- ── 2. Fix coupon_usage.coupon_id FK ─────────────────────────────────────────
ALTER TABLE public.coupon_usage
    DROP CONSTRAINT IF EXISTS coupon_usage_coupon_id_fkey;

ALTER TABLE public.coupon_usage
    ADD CONSTRAINT coupon_usage_coupon_id_fkey
    FOREIGN KEY (coupon_id)
    REFERENCES public.coupons(id)
    ON DELETE CASCADE;

-- ── 3. Safe delete function (runs as superuser, single transaction) ───────────
CREATE OR REPLACE FUNCTION public.admin_delete_coupon(p_coupon_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Null out orders that used this coupon (preserve the order)
    UPDATE public.orders SET coupon_id = NULL WHERE coupon_id = p_coupon_id;
    -- Remove usage history
    DELETE FROM public.coupon_usage WHERE coupon_id = p_coupon_id;
    -- Remove exclusive allowlist (also handled by CASCADE)
    DELETE FROM public.coupon_user_allowlist WHERE coupon_id = p_coupon_id;
    -- Delete the coupon
    DELETE FROM public.coupons WHERE id = p_coupon_id;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.admin_delete_coupon(UUID) TO service_role;

-- ── 4. Reload PostgREST schema cache ─────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
