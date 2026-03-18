-- ============================================================
-- PARCHE — Corrige avisos del linter de Supabase
-- Ejecutar UNA VEZ en el SQL Editor del nuevo proyecto
-- ============================================================

-- 1. SEGURIDAD: Eliminar funciones residuales con search_path mutable
DROP FUNCTION IF EXISTS public.set_updated_at()                       CASCADE;
-- transfer_guest_cart_to_user: intentamos todas las firmas posibles
DROP FUNCTION IF EXISTS public.transfer_guest_cart_to_user(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_guest_cart_to_user(TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_guest_cart_to_user(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_guest_cart_to_user(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.release_expired_reservations()          CASCADE;
DROP FUNCTION IF EXISTS public._cleanup_expired_reservations()         CASCADE;

-- 2. SEGURIDAD: Recrear get_available_stock con search_path = '' (vacío)
--    Supabase exige search_path vacío para pasar el linter de seguridad;
--    las tablas se referencian con esquema completo.
CREATE OR REPLACE FUNCTION public.get_available_stock(p_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    total_stock  INT;
    reserved_qty INT;
BEGIN
    SELECT stock INTO total_stock FROM public.products WHERE id = p_id;
    SELECT COALESCE(SUM(quantity), 0) INTO reserved_qty
    FROM public.stock_reservations
    WHERE product_id = p_id AND expires_at > now();
    RETURN GREATEST(0, total_stock - reserved_qty);
END;
$$;

-- 3. RENDIMIENTO: Eliminar índices duplicados
--    (el índice lo crea automáticamente la restricción UNIQUE de la columna/tabla)
DROP INDEX IF EXISTS public.idx_newsletter_subscribers_email_normalized_unique;
DROP INDEX IF EXISTS public.page_sections_unique;

-- 3. RENDIMIENTO: Añadir índices en foreign keys sin cobertura
CREATE INDEX IF NOT EXISTS idx_return_items_order_item_id ON public.return_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id           ON public.reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_item_id      ON public.reviews(order_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_variant_id ON public.stock_reservations(variant_id);
