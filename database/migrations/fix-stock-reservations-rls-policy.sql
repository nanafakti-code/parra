-- ============================================================
-- BUGFIX: RLS Enabled No Policy en stock_reservations
-- Fecha: 2026-03-10
-- ============================================================
-- La tabla tenía RLS activado pero sin ninguna política definida,
-- lo que bloqueaba cualquier acceso directo a la tabla.
-- 
-- Todo el acceso a stock_reservations ocurre a través de funciones
-- RPC (checkout_reserve_stock_and_order, update_reservation_qty,
-- get_available_stock, cleanup_expired_reservations) invocadas desde
-- supabaseAdmin (service_role), que ya bypasea RLS por defecto.
-- Se crea una política explícita para service_role para satisfacer
-- el linter y dejar el modelo de acceso documentado.
-- ============================================================

CREATE POLICY "Service role full access"
  ON public.stock_reservations FOR ALL TO service_role
  USING (true) WITH CHECK (true);
