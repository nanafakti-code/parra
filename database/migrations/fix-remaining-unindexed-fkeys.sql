-- ============================================================
-- MIGRACIÓN: Completar cobertura de FK en cart_items y orders
-- Fecha: 2026-03-10
-- ============================================================
-- Al eliminar idx_cart_items_cart e idx_orders_user_id como
-- "unused" en la migración anterior, sus FK quedaron sin índice.
-- Se recrean con nombres más explícitos.
-- ------------------------------------------------------------

-- cart_items.cart_id → FK cart_items_cart_id_fkey
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id
  ON public.cart_items (cart_id);

-- orders.user_id → FK orders_user_id_fkey
CREATE INDEX IF NOT EXISTS idx_orders_user_id
  ON public.orders (user_id);
