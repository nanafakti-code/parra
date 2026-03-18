
-- ============================================================
-- schema.sql
-- ============================================================
-- ============================================================
-- ELITEGRIP - E-Commerce Database Schema
-- Tienda de Guantes de Portero + Panel de Administración
-- ============================================================

-- 1. DROP ALL EXISTING TABLES (old Prisma + new)
-- ============================================================
DROP TABLE IF EXISTS public."CartItem" CASCADE;
DROP TABLE IF EXISTS public."OrderItem" CASCADE;
DROP TABLE IF EXISTS public."Order" CASCADE;
DROP TABLE IF EXISTS public."Cart" CASCADE;
DROP TABLE IF EXISTS public."Product" CASCADE;
DROP TABLE IF EXISTS public."User" CASCADE;
DROP TABLE IF EXISTS public.cart_items CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.carts CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.product_images CASCADE;
DROP TABLE IF EXISTS public.product_variants CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.addresses CASCADE;
DROP TABLE IF EXISTS public.coupons CASCADE;
DROP TABLE IF EXISTS public.coupon_usage CASCADE;
DROP TYPE IF EXISTS public.order_status CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;

-- 2. ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('customer', 'admin');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'partial_return');

-- 3. USERS (customers + admins)
-- ============================================================
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role user_role DEFAULT 'customer',
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. CATEGORIES
-- ============================================================
CREATE TABLE categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. PRODUCTS
-- ============================================================
CREATE TABLE products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    short_description TEXT,
    price DECIMAL(10,2) NOT NULL,
    compare_price DECIMAL(10,2),          -- precio anterior (tachado)
    cost DECIMAL(10,2),                   -- costo para admin
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    image TEXT NOT NULL,                  -- imagen principal
    stock INT NOT NULL DEFAULT 0,
    sku TEXT UNIQUE,
    brand TEXT DEFAULT 'EliteGrip',
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    meta_title TEXT,
    meta_description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. PRODUCT IMAGES (galería)
-- ============================================================
CREATE TABLE product_images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt_text TEXT,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. PRODUCT VARIANTS (tallas)
-- ============================================================
CREATE TABLE product_variants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size TEXT NOT NULL,                    -- "7", "8", "9", "10", "11"
    stock INT NOT NULL DEFAULT 0,
    sku TEXT,
    price_override DECIMAL(10,2),         -- precio especial por talla (null = usar precio del producto)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. ADDRESSES
-- ============================================================
CREATE TABLE addresses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT DEFAULT 'Casa',            -- "Casa", "Trabajo", etc.
    full_name TEXT NOT NULL,
    street TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT,
    postal_code TEXT NOT NULL,
    country TEXT DEFAULT 'España',
    phone TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. CARTS
-- ============================================================
CREATE TABLE carts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. CART ITEMS
-- ============================================================
CREATE TABLE cart_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. COUPONS
-- ============================================================
CREATE TABLE coupons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_amount DECIMAL(10,2) DEFAULT 0,
    max_uses INT,                         -- null = ilimitado
    times_used INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    starts_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. ORDERS
-- ============================================================
CREATE TABLE orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    order_number TEXT UNIQUE NOT NULL,     -- "EG-20260001"
    status order_status DEFAULT 'pending',
    subtotal DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
    -- Shipping info (snapshot)
    shipping_name TEXT,
    shipping_street TEXT,
    shipping_city TEXT,
    shipping_state TEXT,
    shipping_postal_code TEXT,
    shipping_country TEXT DEFAULT 'España',
    shipping_phone TEXT,
    -- Tracking
    tracking_number TEXT,
    tracking_url TEXT,
    notes TEXT,                            -- notas internas del admin
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 13. ORDER ITEMS
-- ============================================================
CREATE TABLE order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,            -- snapshot del nombre
    product_image TEXT,                    -- snapshot de la imagen
    size TEXT,                             -- snapshot de la talla
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. COUPON USAGE (tracking)
-- ============================================================
CREATE TABLE coupon_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    used_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(coupon_id, user_id)            -- un cupón por usuario
);

-- 15. REVIEWS
-- ============================================================
CREATE TABLE reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT,
    comment TEXT,
    is_verified BOOLEAN DEFAULT false,    -- compra verificada
    is_approved BOOLEAN DEFAULT false,    -- aprobada por admin
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_product_variants_product ON product_variants(product_id);
CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_coupons_code ON coupons(code);

-- ============================================================
-- ROW LEVEL SECURITY (permisivo para desarrollo)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON product_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON product_variants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON addresses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON carts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON cart_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON coupons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON coupon_usage FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON reviews FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- FUNCTION: Auto-generate order numbers
-- ============================================================
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 4) AS INT)), 0) + 1
    INTO next_num
    FROM orders;
    NEW.order_number := 'EG-' || LPAD(next_num::TEXT, 7, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION generate_order_number();

-- ============================================================
-- FUNCTION: Auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_carts_updated_at BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED DATA: Categories
-- ============================================================
INSERT INTO categories (name, slug, description, display_order) VALUES
('Elite', 'elite', 'Guantes profesionales de competición para porteros de alto rendimiento', 1),
('Entrenamiento', 'entrenamiento', 'Guantes resistentes diseñados para sesiones de entrenamiento intensivo', 2),
('Infantil', 'infantil', 'Guantes adaptados para jóvenes porteros en formación', 3),
('Accesorios', 'accesorios', 'Complementos esenciales para el cuidado y rendimiento del portero', 4);

-- ============================================================
-- SEED DATA: Products (guantes de portero)
-- ============================================================
INSERT INTO products (name, slug, description, short_description, price, compare_price, category_id, image, stock, sku, is_featured) VALUES
(
    'Titan Pro Negative Cut',
    'titan-pro-negative-cut',
    'El Titan Pro es nuestro guante insignia. Fabricado con látex de contacto alemán de 4mm, ofrece un agarre excepcional en todas las condiciones climáticas. El corte negativo proporciona un ajuste ceñido que mejora el control del balón. Palma con zona de absorción de impactos y punzonado para ventilación. Cierre ajustable con muñequera elástica reforzada.',
    'Guante profesional con látex alemán 4mm y corte negativo',
    89.99, 119.99,
    (SELECT id FROM categories WHERE slug = 'elite'),
    'https://images.unsplash.com/photo-1614632537197-38a17061c2bd?w=600',
    50, 'EG-TITAN-001', true
),
(
    'Viper Grip Hybrid',
    'viper-grip-hybrid',
    'El Viper Grip combina la mejor tecnología de corte híbrido: negativo en los dedos para precisión y rollfinger en la palma para máxima superficie de contacto. Látex Supersoft de 3.5mm con tratamiento antideslizante. Protección en nudillos con espuma EVA y malla transpirable en el dorso.',
    'Corte híbrido con látex Supersoft 3.5mm',
    74.99, 99.99,
    (SELECT id FROM categories WHERE slug = 'elite'),
    'https://images.unsplash.com/photo-1509255502105-0838e0715395?w=600',
    35, 'EG-VIPER-001', true
),
(
    'Thunder Roll',
    'thunder-roll',
    'El Thunder Roll está diseñado para porteros que buscan la máxima superficie de agarre. El corte rollfinger envuelve el látex alrededor de los dedos, creando una zona de contacto ampliada. Látex Contact Plus de 4mm con tecnología de absorción de impactos en la palma. Cierre de velcro premium con soporte de muñeca.',
    'Rollfinger con látex Contact Plus 4mm',
    79.99, NULL,
    (SELECT id FROM categories WHERE slug = 'elite'),
    'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=600',
    28, 'EG-THUNDER-001', true
),
(
    'Iron Wall Training',
    'iron-wall-training',
    'Guante de entrenamiento de alta durabilidad. Fabricado con látex resistente a la abrasión de 3mm, ideal para sesiones intensivas en cualquier superficie. Refuerzos en las zonas de mayor desgaste y acolchado interno para protección. Relación calidad-precio excepcional.',
    'Guante de entrenamiento resistente con látex 3mm',
    44.99, 54.99,
    (SELECT id FROM categories WHERE slug = 'entrenamiento'),
    'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=600',
    80, 'EG-IRON-001', false
),
(
    'Flex Control Training',
    'flex-control-training',
    'Diseñado para entrenamientos técnicos donde la flexibilidad y el tacto son clave. Látex suave de 3mm con corte flat para un contacto natural con el balón. Dorso de malla ultra-ligera y transpirable. Perfecto para porteros que valoran la movilidad.',
    'Entrenamiento técnico con corte flat y malla transpirable',
    39.99, NULL,
    (SELECT id FROM categories WHERE slug = 'entrenamiento'),
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600',
    65, 'EG-FLEX-001', false
),
(
    'Junior Pro First',
    'junior-pro-first',
    'El guante perfecto para jóvenes porteros que dan sus primeros pasos. Látex suave de 3mm adaptado a manos pequeñas con un ajuste cómodo y seguro. Protección acolchada en dedos y palma. Diseño llamativo que inspira confianza. Tallas de la 4 a la 7.',
    'Primer guante profesional para jóvenes porteros',
    29.99, 39.99,
    (SELECT id FROM categories WHERE slug = 'infantil'),
    'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=600',
    100, 'EG-JUNIOR-001', true
),
(
    'Mini Keeper',
    'mini-keeper',
    'Guante de iniciación para los más pequeños. Material sintético resistente con palma de látex básico de 2mm. Cierre de velcro fácil de ajustar para niños. Ideal para escuelas de portero y primeros contactos con el fútbol. Tallas de la 3 a la 6.',
    'Guante de iniciación para niños',
    19.99, NULL,
    (SELECT id FROM categories WHERE slug = 'infantil'),
    'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=600',
    120, 'EG-MINI-001', false
),
(
    'Glove Wash Pro',
    'glove-wash-pro',
    'Limpiador profesional formulado específicamente para guantes de portero. Elimina suciedad y restaura la adherencia del látex sin dañar el material. Fórmula biodegradable con pH neutro. Aplicar después de cada uso para prolongar la vida útil de tus guantes. Botella de 250ml.',
    'Limpiador especializado para guantes de portero',
    12.99, NULL,
    (SELECT id FROM categories WHERE slug = 'accesorios'),
    'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=600',
    200, 'EG-WASH-001', false
);

-- ============================================================
-- SEED DATA: Product Variants (tallas)
-- ============================================================
INSERT INTO product_variants (product_id, size, stock, sku)
SELECT p.id, s.size, 
    CASE WHEN s.size IN ('8', '9', '10') THEN 12 ELSE 6 END,
    p.sku || '-' || s.size
FROM products p
CROSS JOIN (VALUES ('7'), ('8'), ('9'), ('10'), ('11')) AS s(size)
WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'elite')
   OR p.category_id = (SELECT id FROM categories WHERE slug = 'entrenamiento');

INSERT INTO product_variants (product_id, size, stock, sku)
SELECT p.id, s.size,
    CASE WHEN s.size IN ('5', '6') THEN 20 ELSE 10 END,
    p.sku || '-' || s.size
FROM products p
CROSS JOIN (VALUES ('4'), ('5'), ('6'), ('7')) AS s(size)
WHERE p.category_id = (SELECT id FROM categories WHERE slug = 'infantil');

-- ============================================================
-- SEED DATA: Admin user (password: admin123)
-- ============================================================
INSERT INTO users (name, email, password, role) VALUES
('Admin EliteGrip', 'admin@elitegrip.com', '$2a$10$6Q5yGdlMzFy3JbFRPCL.XuRHTGnCYasBvWYNxVH6JVr0IqvU5N.Ky', 'admin');

-- ============================================================
-- SEED DATA: Sample coupon
-- ============================================================
INSERT INTO coupons (code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at) VALUES
('BIENVENIDO10', '10% de descuento en tu primera compra', 'percentage', 10, 30, NULL, '2027-01-01'),
('ENVIOGRATIS', 'Envío gratis en pedidos +60€', 'fixed', 5.99, 60, 100, '2026-12-31');


-- ============================================================
-- make-password-nullable.sql
-- ============================================================
-- ============================================================
-- Migración: Hacer password nullable para Supabase Auth
-- Ejecutar en Supabase SQL Editor.
--
-- Con Supabase Auth, la contraseña se gestiona en auth.users,
-- no en public.users. Los nuevos usuarios no tendrán password
-- en la tabla propia.
-- ============================================================

-- 1. Hacer password nullable (los nuevos usuarios de Supabase Auth no la necesitan)
ALTER TABLE users
    ALTER COLUMN password DROP NOT NULL;

-- 2. Establecer valor por defecto para password (opcional, por compatibilidad)
ALTER TABLE users
    ALTER COLUMN password SET DEFAULT NULL;


-- ============================================================
-- admin-panel.sql
-- ============================================================
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


-- ============================================================
-- create-site-settings.sql
-- ============================================================
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


-- ============================================================
-- visual-editor-v2.sql
-- ============================================================
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


-- ============================================================
-- fraud-detection.sql
-- ============================================================
-- ============================================================
-- fraud-detection.sql
-- Señales anti-fraude en el sistema de checkout:
--   1. Tabla fraud_logs — registro de intentos sospechosos
--   2. Columnas en orders — campos para revisión manual
--
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

-- ── 1. Columnas de fraude en la tabla orders ──────────────────────────────────
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS fraud_risk_level      TEXT,          -- 'normal' | 'elevated' | 'highest' | ''
    ADD COLUMN IF NOT EXISTS fraud_review_required BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS payment_outcome_type  TEXT;          -- 'authorized' | 'manual_review' | 'blocked' | …

-- Índice para filtrar órdenes en revisión desde el panel admin
CREATE INDEX IF NOT EXISTS idx_orders_fraud_review
    ON public.orders(fraud_review_required)
    WHERE fraud_review_required = true;

-- Índice para filtrar por nivel de riesgo
CREATE INDEX IF NOT EXISTS idx_orders_fraud_risk
    ON public.orders(fraud_risk_level)
    WHERE fraud_risk_level IS NOT NULL;

-- ── 2. Tabla fraud_logs — log inmutable de intentos sospechosos ───────────────
CREATE TABLE IF NOT EXISTS public.fraud_logs (
    id                UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID         REFERENCES public.users(id) ON DELETE SET NULL,
    ip_address        TEXT,
    payment_intent_id TEXT         NOT NULL,
    risk_level        TEXT,                         -- valor de Stripe outcome.risk_level
    outcome_type      TEXT,                         -- valor de Stripe outcome.type
    details           JSONB        NOT NULL DEFAULT '{}',   -- seller_message, timestamp, etc.
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- RLS: solo service_role puede leer/escribir (supabaseAdmin en el servidor)
ALTER TABLE public.fraud_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fraud_logs_service_role" ON public.fraud_logs;
CREATE POLICY "fraud_logs_service_role"
    ON public.fraud_logs
    FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- Índices operacionales
CREATE INDEX IF NOT EXISTS idx_fraud_logs_payment_intent
    ON public.fraud_logs(payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_fraud_logs_created_at
    ON public.fraud_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_logs_risk_level
    ON public.fraud_logs(risk_level)
    WHERE risk_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fraud_logs_user
    ON public.fraud_logs(user_id)
    WHERE user_id IS NOT NULL;


-- ============================================================
-- newsletter-subscriptions-and-queue.sql
-- ============================================================
-- Newsletter subscribers + async email queue
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    subscribed BOOLEAN NOT NULL DEFAULT true,
    source TEXT NOT NULL DEFAULT 'website',
    unsubscribed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT newsletter_subscribers_email_format_chk
        CHECK (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_email_normalized_unique
    ON public.newsletter_subscribers(email_normalized);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_subscribed
    ON public.newsletter_subscribers(subscribed)
    WHERE subscribed = true;

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_user_id
    ON public.newsletter_subscribers(user_id);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_updated_at
    ON public.newsletter_subscribers(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.newsletter_email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_id UUID REFERENCES public.newsletter_subscribers(id) ON DELETE SET NULL,
    to_email TEXT NOT NULL,
    event_key TEXT,
    subject TEXT NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_started_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    provider_message_id TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_email_queue
    ADD COLUMN IF NOT EXISTS event_key TEXT,
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_status_scheduled
    ON public.newsletter_email_queue(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_created_at
    ON public.newsletter_email_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_to_email
    ON public.newsletter_email_queue(to_email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_email_queue_event_email_unique
    ON public.newsletter_email_queue(event_key, to_email)
    WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_processing_started
    ON public.newsletter_email_queue(processing_started_at)
    WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS public.newsletter_event_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    queued_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_event_dispatches_event_type_created
    ON public.newsletter_event_dispatches(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.newsletter_queue_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID REFERENCES public.newsletter_email_queue(id) ON DELETE SET NULL,
    event TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_queue_logs_queue_id_created
    ON public.newsletter_queue_logs(queue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_queue_logs_event_created
    ON public.newsletter_queue_logs(event, created_at DESC);

CREATE OR REPLACE FUNCTION public.newsletter_set_normalized_email()
RETURNS TRIGGER AS $$
BEGIN
    NEW.email := lower(trim(NEW.email));
    NEW.email_normalized := lower(trim(NEW.email));
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_newsletter_subscribers_normalize'
    ) THEN
        CREATE TRIGGER trg_newsletter_subscribers_normalize
            BEFORE INSERT OR UPDATE ON public.newsletter_subscribers
            FOR EACH ROW
            EXECUTE FUNCTION public.newsletter_set_normalized_email();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.newsletter_set_queue_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.to_email := lower(trim(NEW.to_email));
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_newsletter_queue_timestamps'
    ) THEN
        CREATE TRIGGER trg_newsletter_queue_timestamps
            BEFORE INSERT OR UPDATE ON public.newsletter_email_queue
            FOR EACH ROW
            EXECUTE FUNCTION public.newsletter_set_queue_timestamps();
    END IF;
END $$;

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_email_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'newsletter_subscribers'
          AND policyname = 'newsletter_subscribers_owner_read'
    ) THEN
        CREATE POLICY newsletter_subscribers_owner_read
            ON public.newsletter_subscribers
            FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'newsletter_subscribers'
          AND policyname = 'newsletter_subscribers_owner_update'
    ) THEN
        CREATE POLICY newsletter_subscribers_owner_update
            ON public.newsletter_subscribers
            FOR UPDATE
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;


-- ============================================================
-- profile-features.sql
-- ============================================================
-- ============================================================
-- MIGRATION: profile-features.sql
-- Habilita RLS + políticas para las tablas del perfil de usuario
-- y añade índices de rendimiento.
-- Ejecutar en Supabase SQL Editor (una sola vez).
-- ============================================================

-- ── 1. Columna phone en users (por si es antigua la BD) ───────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- ── 2. Columna updated_at en users ────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── 3. orders.user_id nullable (pedidos de invitado por Stripe) ───────────────
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;

-- ── 4. Columna email en orders (para invitados) ────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS email TEXT;

-- ── 5. Columna stripe_session_id en orders ────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT UNIQUE;

-- ── 6. RLS: addresses ─────────────────────────────────────────────────────────
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own addresses"  ON public.addresses;
DROP POLICY IF EXISTS "users can insert own addresses" ON public.addresses;
DROP POLICY IF EXISTS "users can update own addresses" ON public.addresses;
DROP POLICY IF EXISTS "users can delete own addresses" ON public.addresses;

CREATE POLICY "users can view own addresses"
    ON public.addresses FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "users can insert own addresses"
    ON public.addresses FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own addresses"
    ON public.addresses FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can delete own addresses"
    ON public.addresses FOR DELETE
    USING (auth.uid() = user_id);

-- ── 7. RLS: reviews ────────────────────────────────────────────────────────────
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can view approved reviews"  ON public.reviews;
DROP POLICY IF EXISTS "users can view own reviews"         ON public.reviews;
DROP POLICY IF EXISTS "users can insert own reviews"       ON public.reviews;
DROP POLICY IF EXISTS "users can update own reviews"       ON public.reviews;

CREATE POLICY "anyone can view approved reviews"
    ON public.reviews FOR SELECT
    USING (is_approved = true OR auth.uid() = user_id);

CREATE POLICY "users can insert own reviews"
    ON public.reviews FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own reviews"
    ON public.reviews FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ── 8. RLS: coupon_usage ───────────────────────────────────────────────────────
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own coupon usage" ON public.coupon_usage;

CREATE POLICY "users can view own coupon usage"
    ON public.coupon_usage FOR SELECT
    USING (auth.uid() = user_id);

-- ── 9. RLS: orders (solo lectura propia) ─────────────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own orders" ON public.orders;

CREATE POLICY "users can view own orders"
    ON public.orders FOR SELECT
    USING (auth.uid() = user_id);

-- ── 10. RLS: order_items (a través de orders) ─────────────────────────────────
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own order items" ON public.order_items;

CREATE POLICY "users can view own order items"
    ON public.order_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id AND o.user_id = auth.uid()
        )
    );

-- ── 11. Índices de rendimiento ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_user_id         ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at      ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id      ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id        ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id     ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user_id   ON public.coupon_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images(product_id);

-- ── 12. Trigger: actualizar updated_at en users automáticamente ───────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 13. Permitir que el service role acceda a todo (para supabaseAdmin) ────────
-- (El service role siempre bypasea RLS — esto es solo documentación)
-- La clave SERVICE_ROLE en supabaseAdmin ya bypasea todas las políticas.


-- ============================================================
-- add-stripe-session-id.sql
-- ============================================================
    -- ============================================================
    -- Migración: Soporte para pedidos de invitados y idempotencia de webhooks
    -- Ejecutar en Supabase SQL Editor ANTES de usar el nuevo webhook.
    -- ============================================================

    -- 1. Añadir stripe_session_id para idempotencia del webhook
    --    Permite verificar si un pago ya fue procesado.
    ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS stripe_session_id TEXT UNIQUE;

    -- 2. Hacer user_id nullable para soportar pedidos de invitados
    --    Los invitados no tienen cuenta, solo proporcionan email.
    ALTER TABLE orders
        ALTER COLUMN user_id DROP NOT NULL;

    -- 3. Añadir columna email para pedidos de invitados
    ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS email TEXT;

    -- 4. Índice para búsquedas por stripe_session_id (idempotencia)
    CREATE INDEX IF NOT EXISTS idx_orders_stripe_session
        ON orders(stripe_session_id);

    -- 5. Índice para búsquedas por email (pedidos de invitados)
    CREATE INDEX IF NOT EXISTS idx_orders_email
        ON orders(email);


-- ============================================================
-- secure-checkout-v2.sql
-- ============================================================
-- ============================================================
-- secure-checkout-v2.sql
-- Hardening del flujo de checkout contra:
--   1. Price manipulation (precios desde BD dentro de la RPC)
--   2. Race conditions en stock (FOR UPDATE + operaciones atómicas)
--   3. Coupon abuse (validación atómica de max_uses + registro en coupon_usage)
--   4. Duplicate orders (idempotencia por stripe_payment_intent_id)
--
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

-- ── 1. Asegurar que stripe_payment_intent_id existe y es único ─────────────────
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Índice único (protege contra doble creación de orden para el mismo PaymentIntent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_intent_id
    ON public.orders(stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;

-- ── 2. Actualizar checkout_reserve_stock_and_order ────────────────────────────
--      Firma ampliada: p_coupon_id y p_discount_amount son opcionales.
-- ──────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.checkout_reserve_stock_and_order(jsonb, uuid, text, text, numeric, jsonb);
DROP FUNCTION IF EXISTS public.checkout_reserve_stock_and_order(jsonb, uuid, text, text, numeric, jsonb, uuid, numeric);

CREATE OR REPLACE FUNCTION public.checkout_reserve_stock_and_order(
    p_items             JSONB,
    p_user_id           UUID,
    p_email             TEXT,
    p_payment_intent_id TEXT,
    p_amount_total      NUMERIC,      -- Importe verificado por Stripe (neto, post-descuento)
    p_shipping_info     JSONB,
    p_coupon_id         UUID    DEFAULT NULL,
    p_discount_amount   NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_order_id          UUID;
    v_item              JSONB;
    v_product_id        UUID;
    v_variant_id        TEXT;
    v_quantity          INT;
    v_current_stock     INT;
    v_db_price          NUMERIC;
    v_subtotal          NUMERIC := 0;
    v_discount          NUMERIC;
    v_total             NUMERIC;
    v_coupon_max_uses   INT;
    v_coupon_times_used INT;
BEGIN
    -- ── STEP 1: Idempotencia — no crear una segunda orden para el mismo PaymentIntent ──
    IF p_payment_intent_id IS NOT NULL AND p_payment_intent_id <> '' THEN
        SELECT id INTO v_order_id
        FROM orders
        WHERE stripe_payment_intent_id = p_payment_intent_id
        LIMIT 1;

        IF v_order_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success',       true,
                'order_id',      v_order_id,
                'already_exists', true
            );
        END IF;
    END IF;

    -- ── STEP 2: Validación atómica del cupón (bloqueo FOR UPDATE en la fila) ──────────
    IF p_coupon_id IS NOT NULL THEN
        SELECT max_uses, times_used
        INTO   v_coupon_max_uses, v_coupon_times_used
        FROM   coupons
        WHERE  id = p_coupon_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cupón no encontrado.');
        END IF;

        IF v_coupon_max_uses IS NOT NULL AND v_coupon_times_used >= v_coupon_max_uses THEN
            RETURN jsonb_build_object('success', false, 'error', 'Este cupón ha alcanzado su límite de uso.');
        END IF;
    END IF;

    -- ── STEP 3: Validar stock + capturar precios desde la BD (no desde el cliente) ────
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP

        v_product_id := (v_item->>'id')::UUID;
        v_quantity   := (v_item->>'quantity')::INT;
        v_variant_id :=  v_item->>'variantId';

        -- Cantidad mínima/máxima razonable
        IF v_quantity IS NULL OR v_quantity < 1 OR v_quantity > 100 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error',   'Cantidad inválida para un producto.',
                'failed_product_id', v_product_id
            );
        END IF;

        IF v_variant_id IS NOT NULL AND v_variant_id <> '' THEN
            -- Variante: bloquear la fila de la variante (stock específico de talla)
            SELECT pv.stock,
                   COALESCE(pv.price_override, p.price)
            INTO   v_current_stock, v_db_price
            FROM   product_variants pv
            JOIN   products p ON p.id = pv.product_id
            WHERE  pv.id = v_variant_id::UUID
            FOR UPDATE OF pv;
        ELSE
            -- Producto sin variante
            SELECT stock, price
            INTO   v_current_stock, v_db_price
            FROM   products
            WHERE  id = v_product_id
            FOR UPDATE;
        END IF;

        IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
            RETURN jsonb_build_object(
                'success',           false,
                'error',             'Stock insuficiente.',
                'failed_product_id', v_product_id
            );
        END IF;

        -- Acumulamos subtotal con precio de BD (nunca del cliente)
        v_subtotal := v_subtotal + (v_db_price * v_quantity);
    END LOOP;

    -- ── STEP 4: Calcular totales ──────────────────────────────────────────────────────
    v_discount := GREATEST(0, LEAST(COALESCE(p_discount_amount, 0), v_subtotal));
    v_total    := v_subtotal - v_discount;

    -- ── STEP 5: Crear la orden ────────────────────────────────────────────────────────
    INSERT INTO orders (
        user_id, email, status,
        subtotal, discount, total, shipping_cost,
        coupon_id,
        stripe_payment_intent_id,
        shipping_name, shipping_street, shipping_city,
        shipping_postal_code, shipping_phone,
        created_at
    ) VALUES (
        p_user_id,
        p_email,
        'processing',
        v_subtotal,
        v_discount,
        v_total,
        0,
        p_coupon_id,
        NULLIF(p_payment_intent_id, ''),
        TRIM((p_shipping_info->>'firstName') || ' ' || COALESCE(p_shipping_info->>'lastName', '')),
        p_shipping_info->>'address',
        p_shipping_info->>'city',
        p_shipping_info->>'zip',
        p_shipping_info->>'phone',
        NOW()
    )
    RETURNING id INTO v_order_id;

    -- ── STEP 6: Insertar order_items y decrementar stock (precios de BD) ─────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP

        v_product_id := (v_item->>'id')::UUID;
        v_quantity   := (v_item->>'quantity')::INT;
        v_variant_id :=  v_item->>'variantId';

        -- Precio de BD (ya bloqueado en STEP 3, misma transacción)
        IF v_variant_id IS NOT NULL AND v_variant_id <> '' THEN
            SELECT COALESCE(pv.price_override, p.price)
            INTO   v_db_price
            FROM   product_variants pv
            JOIN   products p ON p.id = pv.product_id
            WHERE  pv.id = v_variant_id::UUID;
        ELSE
            SELECT price INTO v_db_price FROM products WHERE id = v_product_id;
        END IF;

        INSERT INTO order_items (
            order_id, product_id, variant_id, quantity,
            unit_price, total_price,
            product_name, product_image, size
        ) VALUES (
            v_order_id,
            v_product_id,
            CASE WHEN v_variant_id IS NOT NULL AND v_variant_id <> ''
                 THEN v_variant_id::UUID ELSE NULL END,
            v_quantity,
            v_db_price,
            v_db_price * v_quantity,
            COALESCE(v_item->>'name',  'Producto'),
            COALESCE(v_item->>'image', ''),
            v_item->>'size'
        );

        -- Decrementar stock atómicamente
        IF v_variant_id IS NOT NULL AND v_variant_id <> '' THEN
            UPDATE product_variants SET stock = stock - v_quantity WHERE id = v_variant_id::UUID;
            UPDATE products          SET stock = stock - v_quantity WHERE id = v_product_id;
        ELSE
            UPDATE products SET stock = stock - v_quantity WHERE id = v_product_id;
        END IF;
    END LOOP;

    -- ── STEP 7: Registrar uso del cupón ───────────────────────────────────────────────
    IF p_coupon_id IS NOT NULL THEN
        -- Incrementar contador global (eficiente para el check rápido)
        UPDATE coupons
        SET    times_used = times_used + 1
        WHERE  id = p_coupon_id;

        -- Registrar por usuario si el comprador está autenticado
        --   UNIQUE(coupon_id, user_id) previene uso doble del mismo cupón por el mismo usuario
        IF p_user_id IS NOT NULL THEN
            INSERT INTO coupon_usage (coupon_id, user_id, order_id)
            VALUES (p_coupon_id, p_user_id, v_order_id)
            ON CONFLICT (coupon_id, user_id) DO NOTHING;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error interno: ' || SQLERRM);
END;
$$;

-- Permisos para el rol service_role (usado por supabaseAdmin)
ALTER FUNCTION public.checkout_reserve_stock_and_order(
    jsonb, uuid, text, text, numeric, jsonb, uuid, numeric
) SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION public.checkout_reserve_stock_and_order(
    jsonb, uuid, text, text, numeric, jsonb, uuid, numeric
) TO service_role;


-- ============================================================
-- add-partial-return-status.sql
-- ============================================================
-- Añadir el valor 'partial_return' al ENUM order_status
-- Necesario para soportar devoluciones parciales por cantidad
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'partial_return';


-- ============================================================
-- return-items-partial-returns.sql
-- ============================================================
-- ============================================================
-- Tabla return_items: permite devoluciones parciales por artículo.
-- El cliente elige qué artículos (y cuántas unidades) devuelve.
-- El importe del reembolso se calcula a partir de estos artículos.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.return_items (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    return_id       UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
    order_item_id   UUID NOT NULL REFERENCES public.order_items(id),
    product_name    TEXT NOT NULL,
    product_image   TEXT,
    size            TEXT,
    quantity        INT NOT NULL CHECK (quantity > 0),
    unit_price      DECIMAL(10,2) NOT NULL,
    total_price     DECIMAL(10,2) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON public.return_items(return_id);

ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON public.return_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- add-reviews-order-item-unit.sql
-- ============================================================
-- Vincular reseñas a order_item para permitir reseñas por pedido y por unidad
-- Esto permite que un usuario reseñe el mismo producto en pedidos distintos
-- y que cada unidad comprada tenga su propia reseña independiente.
ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unit_index INT NOT NULL DEFAULT 0;

-- Índice único: un usuario solo puede enviar una reseña por (order_item, unidad)
CREATE UNIQUE INDEX IF NOT EXISTS reviews_order_item_unit_unique
    ON reviews(user_id, order_item_id, unit_index)
    WHERE order_item_id IS NOT NULL;


-- ============================================================
-- add-featured-reviews.sql
-- ============================================================
-- Add is_featured column to reviews table
-- Allows admins to mark up to 3 reviews as featured for the homepage testimonials section

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- Index for fast homepage query
CREATE INDEX IF NOT EXISTS idx_reviews_featured ON reviews(is_featured) WHERE is_featured = true;


-- ============================================================
-- create-atomic-stock-functions.sql
-- ============================================================
-- ============================================================
-- Migración: Funciones atómicas de decremento de stock
-- Ejecutar en Supabase SQL Editor.
--
-- Estas funciones usan UPDATE ... WHERE stock >= quantity,
-- lo que garantiza atomicidad a nivel PostgreSQL.
-- No se necesita SELECT previo ni FOR UPDATE explícito.
-- ============================================================

-- 1. Decrementar stock del producto principal
CREATE OR REPLACE FUNCTION decrement_product_stock_atomic(
    product_id UUID,
    quantity INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE products
    SET stock = stock - quantity
    WHERE id = product_id
    AND stock >= quantity;

    IF FOUND THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

-- 2. Decrementar stock de una variante (talla)
CREATE OR REPLACE FUNCTION decrement_variant_stock_atomic(
    variant_id UUID,
    quantity INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE product_variants
    SET stock = stock - quantity
    WHERE id = variant_id
    AND stock >= quantity;

    IF FOUND THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;


-- ============================================================
-- restore-stock-on-cancel.sql
-- ============================================================
-- ============================================================
-- Restaura el stock de variante y producto al cancelar un pedido.
-- Solo se llama desde el endpoint de cancelación (NO desde devoluciones).
-- ============================================================

CREATE OR REPLACE FUNCTION public.restore_order_stock(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN
        SELECT variant_id, product_id, quantity
        FROM order_items
        WHERE order_id = p_order_id
    LOOP
        -- Reponer stock a nivel de producto siempre
        UPDATE products
        SET stock = stock + v_item.quantity
        WHERE id = v_item.product_id;

        -- Reponer stock a nivel de variante si existe
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE product_variants
            SET stock = stock + v_item.quantity
            WHERE id = v_item.variant_id;
        END IF;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_order_stock(UUID) TO service_role;


-- ============================================================
-- exclusive-coupons.sql
-- ============================================================
-- ============================================================
-- EXCLUSIVE COUPONS
-- Adds support for coupons restricted to specific users.
-- ============================================================

-- 1. Flag on coupons: general (false) vs exclusive (true)
ALTER TABLE public.coupons
    ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN NOT NULL DEFAULT false;

-- 2. Allowlist table: which users can use an exclusive coupon
CREATE TABLE IF NOT EXISTS public.coupon_user_allowlist (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    coupon_id  UUID        NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (coupon_id, user_id)
);

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_cupal_coupon_id
    ON public.coupon_user_allowlist (coupon_id);

CREATE INDEX IF NOT EXISTS idx_cupal_user_id
    ON public.coupon_user_allowlist (user_id);

-- 4. RLS: enable + allow each user to read only their own allowlist entries
ALTER TABLE public.coupon_user_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cupal_own_select" ON public.coupon_user_allowlist;
CREATE POLICY "cupal_own_select"
    ON public.coupon_user_allowlist
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));


-- ============================================================
-- add-product-display-order.sql
-- ============================================================
-- ============================================================
-- Add display_order column to products table
-- Allows admin to set custom sort order from Visual Editor
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- Set initial display_order based on created_at (most recent = lowest number = first)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
  FROM products
)
UPDATE products SET display_order = ranked.rn
FROM ranked WHERE products.id = ranked.id;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS idx_products_display_order ON products(display_order);


-- ============================================================
-- add-email-sent-to-orders.sql
-- ============================================================
-- ============================================
-- Añade columna email_sent a la tabla orders
-- ============================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false;

-- Índice para que el endpoint de respaldo pueda buscar órdenes sin email pendientes
CREATE INDEX IF NOT EXISTS idx_orders_email_sent ON public.orders(email_sent) WHERE email_sent = false;

