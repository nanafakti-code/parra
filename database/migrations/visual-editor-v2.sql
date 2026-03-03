-- ============================================
-- Visual Editor V2 – Advanced page sections
-- ============================================

-- Create page_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.page_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  page_key text NOT NULL,
  settings jsonb DEFAULT '{}',
  version integer DEFAULT 1,
  published_settings jsonb,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT page_settings_pkey PRIMARY KEY (id),
  CONSTRAINT page_settings_unique UNIQUE (page_key)
);

-- Add new columns to page_settings for versioning (if table already existed)
ALTER TABLE public.page_settings
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_settings jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Page sections table for granular block management
CREATE TABLE IF NOT EXISTS public.page_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  page_name text NOT NULL,           -- 'home', 'shop', 'elite', etc.
  section_key text NOT NULL,          -- 'hero', 'featured_products', etc.
  label text NOT NULL DEFAULT '',     -- Human-readable label
  content jsonb NOT NULL DEFAULT '{}',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT page_sections_pkey PRIMARY KEY (id),
  CONSTRAINT page_sections_unique UNIQUE (page_name, section_key)
);

-- Section history for undo/redo and change tracking
CREATE TABLE IF NOT EXISTS public.section_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id uuid REFERENCES public.page_sections(id) ON DELETE CASCADE,
  page_name text NOT NULL,
  section_key text NOT NULL,
  content jsonb NOT NULL,
  changed_by uuid REFERENCES public.users(id),
  changed_at timestamptz DEFAULT now(),
  CONSTRAINT section_history_pkey PRIMARY KEY (id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_page_sections_page ON public.page_sections(page_name);
CREATE INDEX IF NOT EXISTS idx_page_sections_order ON public.page_sections(page_name, display_order);
CREATE INDEX IF NOT EXISTS idx_section_history_section ON public.section_history(section_id);
CREATE INDEX IF NOT EXISTS idx_section_history_date ON public.section_history(changed_at DESC);

-- RLS
ALTER TABLE public.page_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_history ENABLE ROW LEVEL SECURITY;

-- Public read access for page_sections (needed for SSR)
CREATE POLICY "Public read page_sections" ON public.page_sections
  FOR SELECT USING (true);

CREATE POLICY "Service role full access sections" ON public.page_sections
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access history" ON public.section_history
  FOR ALL USING (true) WITH CHECK (true);

-- Seed home page sections
INSERT INTO public.page_sections (page_name, section_key, label, display_order, is_active, content) VALUES
  ('home', 'hero', 'Hero Principal', 0, true, '{
    "title_line1": "DOMINA",
    "title_line2": "EL ÁREA",
    "subtitle": "Siente el agarre absoluto. Diseñados para porteros de elite que no aceptan menos que la perfección.",
    "subtitle_mobile": "Agarre absoluto. Para porteros que exigen perfección.",
    "badge": "Nueva Colección 2026",
    "cta_text": "Comprar Ahora",
    "cta_link": "/shop",
    "secondary_text": "Serie Elite",
    "secondary_link": "/shop?category=elite",
    "bg_image": "https://res.cloudinary.com/djvj32zic/image/upload/v1771850353/wmremove-transformed_qkiglz.png",
    "overlay_color": "#000000",
    "overlay_opacity": 0.4
  }'),
  ('home', 'featured_products', 'Productos Destacados', 1, true, '{
    "title": "Productos",
    "title_accent": "Destacados",
    "subtitle": "Nuestra selección de los guantes más vendidos. Tecnología de vanguardia para porteros exigentes.",
    "cta_text": "Ver toda la tienda",
    "cta_link": "/shop",
    "product_slugs": ["parra-kids", "parra-classic-pro", "future-black-fantasy"]
  }'),
  ('home', 'benefits', 'Beneficios', 2, true, '{
    "title": "¿Por qué PARRA?",
    "items": [
      {"icon": "shield", "title": "Protección Máxima", "description": "Látex alemán de 4mm para un agarre superior"},
      {"icon": "award", "title": "Calidad Premium", "description": "Materiales de primera selección en cada guante"},
      {"icon": "truck", "title": "Envío Gratis", "description": "En pedidos superiores a 50€"},
      {"icon": "refresh-cw", "title": "Devolución Fácil", "description": "30 días para cambios y devoluciones"}
    ]
  }'),
  ('home', 'glove_selector', 'Selector de Guantes', 3, true, '{
    "title": "Encuentra tu guante perfecto",
    "subtitle": "Responde unas preguntas y te recomendamos el guante ideal"
  }'),
  ('home', 'testimonials', 'Testimonios', 4, true, '{
    "title": "Lo que dicen los porteros",
    "subtitle": "Opiniones reales de porteros profesionales y amateur"
  }'),
  ('home', 'cta_banner', 'Banner CTA', 5, true, '{
    "title_line1": "¿LISTO PARA",
    "title_line2": "VOLAR?",
    "cta_text": "Únete al Club PARRA",
    "cta_link": "/register",
    "bg_image": "https://res.cloudinary.com/djvj32zic/image/upload/v1771869186/b6c3767d-ca9e-49a5-8187-b0610793ba75_zgic3i.png",
    "overlay_opacity": 0.7
  }'),
  ('home', 'newsletter', 'Newsletter', 6, true, '{
    "title": "Únete a la familia PARRA",
    "subtitle": "Recibe descuentos exclusivos y novedades",
    "button_text": "Suscribirse"
  }'),
  ('shop', 'banner', 'Banner Superior', 0, true, '{
    "text": "Envío gratis en pedidos +50€",
    "bg_color": "#39FF14",
    "text_color": "#000000"
  }')
ON CONFLICT (page_name, section_key) DO NOTHING;
