-- ============================================================
-- MIGRATION: profile-features.sql
-- Habilita RLS + políticas para las tablas del perfil de usuario
-- y añade índices de rendimiento.
-- Ejecutar en Supabase SQL Editor (una sola vez).
-- ============================================================

-- ── 1. Columna phone en users (por si es antigua la BD) ───────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- ── 2. Columna updated_at en users ────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── 3. orders.user_id nullable (pedidos de invitado por Stripe) ───────────────
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;

-- ── 4. Columna email en orders (para invitados) ────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS email TEXT;

-- ── 5. Columna stripe_session_id en orders ────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT UNIQUE;

-- ── 6. RLS: addresses ─────────────────────────────────────────────────────────
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own addresses"  ON public.addresses;
DROP POLICY IF EXISTS "users can insert own addresses" ON public.addresses;
DROP POLICY IF EXISTS "users can update own addresses" ON public.addresses;
DROP POLICY IF EXISTS "users can delete own addresses" ON public.addresses;

CREATE POLICY "users can view own addresses"
    ON public.addresses FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "users can insert own addresses"
    ON public.addresses FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own addresses"
    ON public.addresses FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can delete own addresses"
    ON public.addresses FOR DELETE
    USING (auth.uid() = user_id);

-- ── 7. RLS: reviews ────────────────────────────────────────────────────────────
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can view approved reviews"  ON public.reviews;
DROP POLICY IF EXISTS "users can view own reviews"         ON public.reviews;
DROP POLICY IF EXISTS "users can insert own reviews"       ON public.reviews;
DROP POLICY IF EXISTS "users can update own reviews"       ON public.reviews;

CREATE POLICY "anyone can view approved reviews"
    ON public.reviews FOR SELECT
    USING (is_approved = true OR auth.uid() = user_id);

CREATE POLICY "users can insert own reviews"
    ON public.reviews FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own reviews"
    ON public.reviews FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ── 8. RLS: coupon_usage ───────────────────────────────────────────────────────
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own coupon usage" ON public.coupon_usage;

CREATE POLICY "users can view own coupon usage"
    ON public.coupon_usage FOR SELECT
    USING (auth.uid() = user_id);

-- ── 9. RLS: orders (solo lectura propia) ─────────────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own orders" ON public.orders;

CREATE POLICY "users can view own orders"
    ON public.orders FOR SELECT
    USING (auth.uid() = user_id);

-- ── 10. RLS: order_items (a través de orders) ─────────────────────────────────
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own order items" ON public.order_items;

CREATE POLICY "users can view own order items"
    ON public.order_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id AND o.user_id = auth.uid()
        )
    );

-- ── 11. Índices de rendimiento ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_user_id         ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at      ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id      ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id        ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id     ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user_id   ON public.coupon_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images(product_id);

-- ── 12. Trigger: actualizar updated_at en users automáticamente ───────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 13. Permitir que el service role acceda a todo (para supabaseAdmin) ────────
-- (El service role siempre bypasea RLS — esto es solo documentación)
-- La clave SERVICE_ROLE en supabaseAdmin ya bypasea todas las políticas.
