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
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');

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
