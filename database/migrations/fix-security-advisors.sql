-- ============================================================
-- MIGRACIÓN: Arreglar advertencias del Security Advisor de Supabase
-- Fecha: 2026-03-10
-- ============================================================

-- ❶ ERROR: RLS Disabled in Public - tabla page_settings
-- page_settings es accedida exclusivamente por supabaseAdmin (service_role)
ALTER TABLE public.page_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.page_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ❷ WARN: RLS Policy Always True
-- Las políticas "Service role full access" estaban asignadas al rol PUBLIC,
-- permitiendo que cualquier usuario (anon/authenticated) hiciera escrituras sin restricción.
-- Se restringen al rol service_role, que ya bypasea RLS por defecto en Supabase.

-- admin_logs
DROP POLICY IF EXISTS "Service role full access" ON public.admin_logs;
CREATE POLICY "Service role full access"
  ON public.admin_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- page_sections (la política de lectura pública SELECT se mantiene intacta)
DROP POLICY IF EXISTS "Service role full access sections" ON public.page_sections;
CREATE POLICY "Service role full access sections"
  ON public.page_sections FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- section_history
DROP POLICY IF EXISTS "Service role full access history" ON public.section_history;
CREATE POLICY "Service role full access history"
  ON public.section_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- site_settings
DROP POLICY IF EXISTS "Service role full access" ON public.site_settings;
CREATE POLICY "Service role full access"
  ON public.site_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ❸ WARN: Function Search Path Mutable
-- Fija search_path = public en todas las funciones para prevenir ataques
-- de search_path injection donde un atacante podría crear objetos en schemas
-- maliciosos que se resolverían antes que los del schema correcto.

ALTER FUNCTION public.cleanup_expired_reservations()
  SET search_path = public;

ALTER FUNCTION public.generate_order_number()
  SET search_path = public;

ALTER FUNCTION public.update_updated_at()
  SET search_path = public;

ALTER FUNCTION public.set_updated_at()
  SET search_path = public;

ALTER FUNCTION public.is_admin()
  SET search_path = public;

ALTER FUNCTION public.decrement_product_stock_atomic(uuid, integer)
  SET search_path = public;

ALTER FUNCTION public.decrement_variant_stock_atomic(uuid, integer)
  SET search_path = public;

ALTER FUNCTION public.update_reservation_qty(text, uuid, integer)
  SET search_path = public;

ALTER FUNCTION public.update_reservation_qty(text, uuid, uuid, integer)
  SET search_path = public;

ALTER FUNCTION public.get_available_stock(uuid)
  SET search_path = public;

ALTER FUNCTION public.checkout_reserve_stock_and_order(jsonb, uuid, text, text, numeric, jsonb)
  SET search_path = public;


-- ⚠️ WARN: Leaked Password Protection Disabled
-- Este ajuste NO se puede aplicar por SQL. Debe configurarse manualmente desde:
-- Supabase Dashboard → Authentication → Sign In / Up → Password Strength
-- → Activar "Enable Leaked Password Protection"
-- Esto conecta con HaveIBeenPwned.org para rechazar contraseñas comprometidas.
