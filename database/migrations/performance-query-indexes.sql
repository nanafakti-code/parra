-- ============================================================
-- MIGRACIÓN: Índices para optimización de consultas frecuentes
-- Fecha: 2026-03-14
-- ============================================================
-- Índices orientados a reducir seq scans en las rutas críticas:
-- home page, shop, product detail, checkout, profile, admin dashboard.
-- ============================================================

-- addresses: listado y actualización por usuario
CREATE INDEX IF NOT EXISTS idx_addresses_user_id
  ON public.addresses (user_id);

-- orders: dashboard paginado + filtros de estado cronológico
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON public.orders (user_id, created_at DESC);

-- products: consultas de tienda (activos + categoría, activos + destacados)
CREATE INDEX IF NOT EXISTS idx_products_active_category
  ON public.products (is_active, category_id);

CREATE INDEX IF NOT EXISTS idx_products_active_featured
  ON public.products (is_active, is_featured);

CREATE INDEX IF NOT EXISTS idx_products_active_display_order
  ON public.products (is_active, display_order);

-- page_sections: se eliminó idx_page_sections_page en migración anterior;
-- lo recreamos con cobertura de display_order para el ORDER BY de la home
CREATE INDEX IF NOT EXISTS idx_page_sections_page_order
  ON public.page_sections (page_name, display_order);

-- coupon_usage: verificación de uso por usuario en checkout
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user_id
  ON public.coupon_usage (user_id);

-- reviews: carga de reseñas por producto y por usuario
CREATE INDEX IF NOT EXISTS idx_reviews_user_id
  ON public.reviews (user_id);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id
  ON public.reviews (product_id);
