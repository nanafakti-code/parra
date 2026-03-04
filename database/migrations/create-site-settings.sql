-- =====================================================
-- Crear tabla site_settings si no existe
-- Ejecutar en Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS public.site_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT site_settings_pkey PRIMARY KEY (id)
);

-- Insertar configuraciones por defecto
INSERT INTO public.site_settings (key, value) VALUES
  ('brand', '{"name": "PARRA", "logo_url": "", "primary_color": "#39FF14", "secondary_color": "#2DD60E"}'),
  ('contact', '{"email": "", "phone": "", "address": ""}'),
  ('shipping', '{"free_threshold": 50, "standard_cost": 4.99, "express_cost": 9.99}'),
  ('taxes', '{"iva_rate": 21, "included_in_price": true}'),
  ('returns_policy', '{"days_limit": 30, "description": "Devoluciones gratuitas en 30 días"}'),
  ('stripe', '{"public_key": "", "webhook_secret": ""}'),
  ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;

-- Habilitar RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Política para service role (admin operations)
CREATE POLICY "Service role full access on site_settings"
  ON public.site_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);
