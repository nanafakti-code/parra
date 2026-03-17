-- Añadir el valor 'partial_return' al ENUM order_status
-- Necesario para soportar devoluciones parciales por cantidad
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'partial_return';
