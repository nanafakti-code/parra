-- ============================================================
-- EXCLUSIVE COUPONS
-- Adds support for coupons restricted to specific users.
-- ============================================================

-- 1. Flag on coupons: general (false) vs exclusive (true)
ALTER TABLE public.coupons
    ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN NOT NULL DEFAULT false;

-- 2. Allowlist table: which users can use an exclusive coupon
CREATE TABLE IF NOT EXISTS public.coupon_user_allowlist (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    coupon_id  UUID        NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (coupon_id, user_id)
);

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_cupal_coupon_id
    ON public.coupon_user_allowlist (coupon_id);

CREATE INDEX IF NOT EXISTS idx_cupal_user_id
    ON public.coupon_user_allowlist (user_id);

-- 4. RLS: enable + allow each user to read only their own allowlist entries
ALTER TABLE public.coupon_user_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cupal_own_select" ON public.coupon_user_allowlist;
CREATE POLICY "cupal_own_select"
    ON public.coupon_user_allowlist
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
