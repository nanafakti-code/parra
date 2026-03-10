-- ============================================================
-- MIGRACIÓN: Arreglar advertencias de PERFORMANCE del Security Advisor
-- Fecha: 2026-03-10
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. AUTH_RLS_INITPLAN
-- Envolver auth.uid() en (SELECT auth.uid()) para que Postgres
-- lo evalúe una sola vez por query en lugar de una vez por fila.
-- ═══════════════════════════════════════════════════════════════

-- ── users ──────────────────────────────────────────────────────
DROP POLICY "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- users_admin_all_safe: antes usaba auth.role() y se aplicaba al rol
-- 'public' (que incluye authenticated), causando auth_rls_initplan Y
-- multiple_permissive_policies. Se reemplaza por TO service_role directa.
DROP POLICY "users_admin_all_safe" ON public.users;
CREATE POLICY "users_admin_all_safe" ON public.users
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── orders ─────────────────────────────────────────────────────
DROP POLICY "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own" ON public.orders
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()))
    OR (email ~~* (SELECT email FROM users WHERE id = (SELECT auth.uid())))
  );

DROP POLICY "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── order_items ────────────────────────────────────────────────
DROP POLICY "order_items_select_own" ON public.order_items;
CREATE POLICY "order_items_select_own" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
        AND (
          orders.user_id = (SELECT auth.uid())
          OR orders.email ~~* (SELECT email FROM users WHERE id = (SELECT auth.uid()))
        )
    )
  );

-- ── addresses ──────────────────────────────────────────────────
DROP POLICY "addresses_select_own" ON public.addresses;
CREATE POLICY "addresses_select_own" ON public.addresses
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY "addresses_insert_own" ON public.addresses;
CREATE POLICY "addresses_insert_own" ON public.addresses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY "addresses_update_own" ON public.addresses;
CREATE POLICY "addresses_update_own" ON public.addresses
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY "addresses_delete_own" ON public.addresses;
CREATE POLICY "addresses_delete_own" ON public.addresses
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── carts ──────────────────────────────────────────────────────
DROP POLICY "carts_own" ON public.carts;
CREATE POLICY "carts_own" ON public.carts
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── cart_items ─────────────────────────────────────────────────
DROP POLICY "cart_items_own" ON public.cart_items;
CREATE POLICY "cart_items_own" ON public.cart_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM carts
      WHERE carts.id = cart_items.cart_id
        AND carts.user_id = (SELECT auth.uid())
    )
  );

-- ── coupon_usage ───────────────────────────────────────────────
DROP POLICY "coupon_usage_own" ON public.coupon_usage;
CREATE POLICY "coupon_usage_own" ON public.coupon_usage
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── reviews ────────────────────────────────────────────────────
DROP POLICY "reviews_insert_own" ON public.reviews;
CREATE POLICY "reviews_insert_own" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY "reviews_update_own" ON public.reviews;
CREATE POLICY "reviews_update_own" ON public.reviews
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ═══════════════════════════════════════════════════════════════
-- 2. MULTIPLE_PERMISSIVE_POLICIES: pro_goalkeepers
-- "Allow admin all access" (ALL TO authenticated) +
-- "Allow public read-only access" (SELECT TO public) causaban
-- dos políticas permisivas para authenticated SELECT.
-- Solución: una sola política SELECT unificada + service_role para admin.
-- ═══════════════════════════════════════════════════════════════
DROP POLICY "Allow admin all access" ON public.pro_goalkeepers;
DROP POLICY "Allow public read-only access" ON public.pro_goalkeepers;

CREATE POLICY "Allow public read" ON public.pro_goalkeepers
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR (SELECT is_admin()));

CREATE POLICY "Service role full access" ON public.pro_goalkeepers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════
-- 3. DUPLICATE_INDEX: eliminar índices idénticos
-- Se conservan los nombres *_id por ser más descriptivos.
-- ═══════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS public.idx_order_items_order;  -- duplicado de idx_order_items_order_id
DROP INDEX IF EXISTS public.idx_orders_user;         -- duplicado de idx_orders_user_id
DROP INDEX IF EXISTS public.idx_reviews_product;     -- duplicado de idx_reviews_product_id
