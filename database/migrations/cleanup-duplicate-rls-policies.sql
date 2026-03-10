-- ============================================================
-- Migración: Limpieza de políticas RLS duplicadas
-- Ejecutar en Supabase SQL Editor DESPUÉS de restrictive-rls-policies.sql
--
-- Elimina las políticas antiguas que quedaron tras aplicar las nuevas.
-- Las políticas "nuevas" (del restrictive-rls-policies.sql) se mantienen.
-- ============================================================

-- ── ADDRESSES ────────────────────────────────────────────────────────────────
-- Eliminar: políticas en inglés antiguas + addresses_manage_own (FOR ALL que
--           queda supersedida por las 4 políticas individuales más granulares)
DROP POLICY IF EXISTS "users can view own addresses"   ON addresses;
DROP POLICY IF EXISTS "users can insert own addresses" ON addresses;
DROP POLICY IF EXISTS "users can update own addresses" ON addresses;
DROP POLICY IF EXISTS "users can delete own addresses" ON addresses;
DROP POLICY IF EXISTS "addresses_manage_own"           ON addresses;

-- ── CARTS ────────────────────────────────────────────────────────────────────
-- carts_own (FOR ALL) es la política activa; carts_manage_own es duplicada.
DROP POLICY IF EXISTS "carts_manage_own" ON carts;

-- ── CART ITEMS ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cart_items_manage_own" ON cart_items;

-- ── COUPONS ──────────────────────────────────────────────────────────────────
-- coupons_select_active es la política activa (solo las activas).
DROP POLICY IF EXISTS "coupons_public_read_active" ON coupons;

-- ── ORDERS ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users can view own orders" ON orders;

-- ── ORDER ITEMS ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users can view own order items" ON order_items;

-- ── COUPON USAGE ─────────────────────────────────────────────────────────────
-- coupon_usage_own es la política activa.
DROP POLICY IF EXISTS "coupon_usage_select_own"          ON coupon_usage;
DROP POLICY IF EXISTS "users can view own coupon usage"  ON coupon_usage;

-- ── REVIEWS ──────────────────────────────────────────────────────────────────
-- Sustituimos reviews_select_all (USING true — muestra no aprobadas también)
-- por una que solo expone reviews aprobadas al público.
DROP POLICY IF EXISTS "reviews_select_all"             ON reviews;
DROP POLICY IF EXISTS "reviews_public_read"            ON reviews;
DROP POLICY IF EXISTS "anyone can view approved reviews" ON reviews;
DROP POLICY IF EXISTS "users can insert own reviews"   ON reviews;
DROP POLICY IF EXISTS "users can update own reviews"   ON reviews;

-- Recrear la política pública solo para reviews aprobadas
CREATE POLICY "reviews_approved_public" ON reviews
  FOR SELECT
  USING (is_approved = true);

-- ── PRODUCTS ─────────────────────────────────────────────────────────────────
-- products_select_active (is_active = true) es la correcta.
DROP POLICY IF EXISTS "products_public_read" ON products;

-- ── CATEGORIES ────────────────────────────────────────────────────────────────
-- categories_select_active (is_active = true) es la correcta.
DROP POLICY IF EXISTS "categories_public_read" ON categories;

-- ── PRODUCT IMAGES & VARIANTS ────────────────────────────────────────────────
DROP POLICY IF EXISTS "product_images_public_read" ON product_images;
DROP POLICY IF EXISTS "variants_public_read"       ON product_variants;

-- ── VERIFICACIÓN FINAL ────────────────────────────────────────────────────────
-- Tras ejecutar, comprueba que no haya duplicados por tabla:
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
