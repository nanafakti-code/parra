-- ============================================================
-- MIGRACIÓN: Arreglar unindexed_foreign_keys y unused_index
-- Fecha: 2026-03-10
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. UNINDEXED FOREIGN KEYS
-- Crear índices para cubrir las FK que carecían de índice.
-- Sin estos índices Postgres hace seq scan en la tabla referenciada
-- al hacer ON DELETE/UPDATE o al hacer JOIN desde hijos.
-- ═══════════════════════════════════════════════════════════════

-- cart_items: FK a products y a product_variants
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id
  ON public.cart_items (product_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id
  ON public.cart_items (variant_id);

-- coupon_usage: FK a orders
CREATE INDEX IF NOT EXISTS idx_coupon_usage_order_id
  ON public.coupon_usage (order_id);

-- order_items: FK a products y a product_variants
CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items (product_id);

CREATE INDEX IF NOT EXISTS idx_order_items_variant_id
  ON public.order_items (variant_id);

-- orders: FK a coupons
CREATE INDEX IF NOT EXISTS idx_orders_coupon_id
  ON public.orders (coupon_id);

-- section_history: FK a users (changed_by)
CREATE INDEX IF NOT EXISTS idx_section_history_changed_by
  ON public.section_history (changed_by);

-- stock_reservations: FK a products
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product_id
  ON public.stock_reservations (product_id);


-- ═══════════════════════════════════════════════════════════════
-- 2. UNUSED INDEXES
-- Índices que pg_stat_user_indexes muestra con idx_scan = 0.
-- Se eliminan para reducir overhead en INSERT/UPDATE/DELETE.
-- ═══════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS public.idx_products_featured;       -- public.products
DROP INDEX IF EXISTS public.idx_orders_status;            -- public.orders
DROP INDEX IF EXISTS public.idx_orders_number;            -- public.orders
DROP INDEX IF EXISTS public.idx_cart_items_cart;          -- public.cart_items
DROP INDEX IF EXISTS public.idx_coupons_code;             -- public.coupons
DROP INDEX IF EXISTS public.idx_reservations_session;     -- public.stock_reservations
DROP INDEX IF EXISTS public.idx_orders_user_id;           -- public.orders
DROP INDEX IF EXISTS public.idx_page_sections_page;       -- public.page_sections
DROP INDEX IF EXISTS public.idx_admin_logs_created_at;    -- public.admin_logs
DROP INDEX IF EXISTS public.idx_orders_email_sent;        -- public.orders
