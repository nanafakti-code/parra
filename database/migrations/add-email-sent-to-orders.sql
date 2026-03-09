-- ============================================
-- Añade columna email_sent a la tabla orders
-- ============================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false;

-- Índice para que el endpoint de respaldo pueda buscar órdenes sin email pendientes
CREATE INDEX IF NOT EXISTS idx_orders_email_sent ON public.orders(email_sent) WHERE email_sent = false;
