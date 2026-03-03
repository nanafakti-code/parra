-- =====================================================
-- PARRA Admin Panel – Database Migration
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Returns table
CREATE TABLE IF NOT EXISTS public.returns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'refunded')),
  admin_notes text,
  refund_amount numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT returns_pkey PRIMARY KEY (id)
);

-- 2. Admin activity logs
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.users(id),
  action text NOT NULL,
  entity_type text, -- 'order', 'product', 'user', 'coupon', etc.
  entity_id uuid,
  details jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT admin_logs_pkey PRIMARY KEY (id)
);

-- 3. Page settings for visual editor
CREATE TABLE IF NOT EXISTS public.page_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  page_key text NOT NULL UNIQUE, -- 'home', 'shop', etc.
  settings jsonb NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT page_settings_pkey PRIMARY KEY (id)
);

-- 4. Site settings (global configuration)
CREATE TABLE IF NOT EXISTS public.site_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT site_settings_pkey PRIMARY KEY (id)
);

-- Insert default site settings
INSERT INTO public.site_settings (key, value) VALUES
  ('brand', '{"name": "PARRA", "logo_url": "", "primary_color": "#39FF14", "secondary_color": "#2DD60E"}'),
  ('contact', '{"email": "", "phone": "", "address": ""}'),
  ('shipping', '{"free_threshold": 50, "standard_cost": 4.99, "express_cost": 9.99}'),
  ('taxes', '{"iva_rate": 21, "included_in_price": true}'),
  ('returns_policy', '{"days_limit": 30, "description": "Devoluciones gratuitas en 30 días"}'),
  ('stripe', '{"public_key": "", "webhook_secret": ""}')
ON CONFLICT (key) DO NOTHING;

-- Insert default page settings
INSERT INTO public.page_settings (page_key, settings) VALUES
  ('home', '{
    "hero": {
      "title_line1": "DOMINA",
      "title_line2": "EL ÁREA",
      "subtitle": "Agarre absoluto. Para porteros que exigen perfección.",
      "badge": "Nueva Colección 2026",
      "cta_text": "Comprar Ahora",
      "cta_link": "/shop",
      "secondary_text": "Serie Elite",
      "secondary_link": "/shop?category=elite",
      "bg_image": "https://res.cloudinary.com/djvj32zic/image/upload/v1771850353/wmremove-transformed_qkiglz.png",
      "enabled": true
    },
    "featured_products": {"enabled": true, "title": "Productos Destacados"},
    "benefits": {"enabled": true},
    "glove_selector": {"enabled": true},
    "testimonials": {"enabled": true},
    "cta_banner": {"enabled": true, "title_line1": "¿LISTO PARA", "title_line2": "VOLAR?"},
    "newsletter": {"enabled": true}
  }'),
  ('shop', '{"banner_enabled": true, "banner_text": "Envío gratis en pedidos +50€"}')
ON CONFLICT (page_key) DO NOTHING;

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_returns_order_id ON public.returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_user_id ON public.returns(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON public.returns(status);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON public.admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_entity ON public.admin_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_reviews_is_approved ON public.reviews(is_approved);

-- 6. RLS Policies (admin bypasses with service role)
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (admin operations use supabaseAdmin)
CREATE POLICY "Service role full access" ON public.returns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.admin_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.page_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.site_settings FOR ALL USING (true) WITH CHECK (true);
