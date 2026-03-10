-- ============================================================
-- Migración: Políticas RLS restrictivas para producción
-- Ejecutar en Supabase SQL Editor ANTES de lanzar a producción.
--
-- Estrategia:
--   • El back-end usa service_role key (bypassa RLS) → sin cambios.
--   • El front-end usa anon/authenticated key → restricciones aquí.
--   • Los admins se identifican por locals.role (server-side) — RLS
--     no necesita distinguir admins en el cliente.
-- ============================================================

-- ── 1. USERS ─────────────────────────────────────────────────────────────────
-- Cada usuario solo puede leer y actualizar su propio perfil.

DROP POLICY IF EXISTS "Allow all" ON users;
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;

CREATE POLICY "users_select_own" ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── 2. ORDERS ─────────────────────────────────────────────────────────────────
-- Ya cubierto por fix_orders_rls.sql (user_id OR email match).
-- Re-aplicamos aquí para ser la única fuente de verdad.

DROP POLICY IF EXISTS "Allow all" ON orders;
DROP POLICY IF EXISTS "orders_select_own" ON orders;
DROP POLICY IF EXISTS "orders_select_consolidated" ON orders;
DROP POLICY IF EXISTS "orders_insert_own" ON orders;

-- Lectura: user_id propio o email que coincide
CREATE POLICY "orders_select_own" ON orders
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR email ILIKE (SELECT email FROM public.users WHERE id = auth.uid())
  );

-- Inserción: solo el propio usuario (o service_role desde webhook)
CREATE POLICY "orders_insert_own" ON orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── 3. ORDER ITEMS ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON order_items;
DROP POLICY IF EXISTS "order_items_select_own" ON order_items;
DROP POLICY IF EXISTS "order_items_select_consolidated" ON order_items;

CREATE POLICY "order_items_select_own" ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
        AND (
          orders.user_id = auth.uid()
          OR orders.email ILIKE (SELECT email FROM public.users WHERE id = auth.uid())
        )
    )
  );

-- ── 4. ADDRESSES ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON addresses;
DROP POLICY IF EXISTS "addresses_select_own" ON addresses;
DROP POLICY IF EXISTS "addresses_insert_own" ON addresses;
DROP POLICY IF EXISTS "addresses_update_own" ON addresses;
DROP POLICY IF EXISTS "addresses_delete_own" ON addresses;

CREATE POLICY "addresses_select_own" ON addresses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "addresses_insert_own" ON addresses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "addresses_update_own" ON addresses
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "addresses_delete_own" ON addresses
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 5. CARTS & CART ITEMS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON carts;
DROP POLICY IF EXISTS "Allow all" ON cart_items;
DROP POLICY IF EXISTS "carts_own" ON carts;
DROP POLICY IF EXISTS "cart_items_own" ON cart_items;

CREATE POLICY "carts_own" ON carts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cart_items_own" ON cart_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM carts WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid())
  );

-- Carrito de invitados (anon): identificado por session_id — la lógica de
-- sesión se gestiona enteramente server-side (service_role), anon no necesita acceso.

-- ── 6. COUPON USAGE ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON coupon_usage;
DROP POLICY IF EXISTS "coupon_usage_own" ON coupon_usage;

CREATE POLICY "coupon_usage_own" ON coupon_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 7. REVIEWS ────────────────────────────────────────────────────────────────
-- Lectura pública, escritura solo del propio usuario.
DROP POLICY IF EXISTS "Allow all" ON reviews;
DROP POLICY IF EXISTS "reviews_select_all" ON reviews;
DROP POLICY IF EXISTS "reviews_insert_own" ON reviews;
DROP POLICY IF EXISTS "reviews_update_own" ON reviews;

CREATE POLICY "reviews_select_all" ON reviews
  FOR SELECT
  USING (true);  -- Reviews son públicas

CREATE POLICY "reviews_insert_own" ON reviews
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "reviews_update_own" ON reviews
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 8. PRODUCTOS, CATEGORÍAS, IMÁGENES, VARIANTES ────────────────────────────
-- Lectura pública (catálogo abierto). Escritura solo vía service_role (admin backend).
DROP POLICY IF EXISTS "Allow all" ON products;
DROP POLICY IF EXISTS "Allow all" ON categories;
DROP POLICY IF EXISTS "Allow all" ON product_images;
DROP POLICY IF EXISTS "Allow all" ON product_variants;
DROP POLICY IF EXISTS "products_select_active" ON products;
DROP POLICY IF EXISTS "categories_select_active" ON categories;
DROP POLICY IF EXISTS "product_images_select" ON product_images;
DROP POLICY IF EXISTS "product_variants_select" ON product_variants;

CREATE POLICY "products_select_active" ON products
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "categories_select_active" ON categories
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "product_images_select" ON product_images
  FOR SELECT
  USING (true);

CREATE POLICY "product_variants_select" ON product_variants
  FOR SELECT
  USING (true);

-- ── 9. COUPONS ────────────────────────────────────────────────────────────────
-- Solo lectura para usuarios autenticados (para validar en checkout).
-- Escritura exclusiva vía service_role.
DROP POLICY IF EXISTS "Allow all" ON coupons;
DROP POLICY IF EXISTS "coupons_select_active" ON coupons;

CREATE POLICY "coupons_select_active" ON coupons
  FOR SELECT TO authenticated
  USING (is_active = true);

-- ── VERIFICACIÓN ──────────────────────────────────────────────────────────────
-- Ejecuta esto tras aplicar la migración para confirmar que las políticas existen:
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
