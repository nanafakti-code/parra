-- ============================================================
-- MIGRACIÓN DEFINITIVA — Estado real exportado del proyecto actual
-- Ejecutar en el SQL Editor del nuevo proyecto Supabase
-- UNA SOLA VEZ, en un proyecto vacío
-- ============================================================

-- ============================================================
-- LIMPIEZA PREVIA (por si había migraciones parciales anteriores)
-- Se eliminan en orden inverso de dependencias
-- ============================================================
DROP TABLE IF EXISTS public.newsletter_queue_logs        CASCADE;
DROP TABLE IF EXISTS public.newsletter_event_dispatches  CASCADE;
DROP TABLE IF EXISTS public.newsletter_email_queue       CASCADE;
DROP TABLE IF EXISTS public.newsletter_subscribers       CASCADE;
DROP TABLE IF EXISTS public.stock_reservations           CASCADE;
DROP TABLE IF EXISTS public.return_items                 CASCADE;
DROP TABLE IF EXISTS public.returns                      CASCADE;
DROP TABLE IF EXISTS public.fraud_logs                   CASCADE;
DROP TABLE IF EXISTS public.section_history              CASCADE;
DROP TABLE IF EXISTS public.page_sections                CASCADE;
DROP TABLE IF EXISTS public.page_settings                CASCADE;
DROP TABLE IF EXISTS public.site_settings                CASCADE;
DROP TABLE IF EXISTS public.admin_logs                   CASCADE;
DROP TABLE IF EXISTS public.reviews                      CASCADE;
DROP TABLE IF EXISTS public.coupon_usage                 CASCADE;
DROP TABLE IF EXISTS public.order_items                  CASCADE;
DROP TABLE IF EXISTS public.orders                       CASCADE;
DROP TABLE IF EXISTS public.coupon_user_allowlist        CASCADE;
DROP TABLE IF EXISTS public.coupons                      CASCADE;
DROP TABLE IF EXISTS public.cart_items                   CASCADE;
DROP TABLE IF EXISTS public.carts                        CASCADE;
DROP TABLE IF EXISTS public.addresses                    CASCADE;
DROP TABLE IF EXISTS public.product_variants             CASCADE;
DROP TABLE IF EXISTS public.product_images               CASCADE;
DROP TABLE IF EXISTS public.products                     CASCADE;
DROP TABLE IF EXISTS public.categories                   CASCADE;
DROP TABLE IF EXISTS public.pro_goalkeepers              CASCADE;
DROP TABLE IF EXISTS public.users                        CASCADE;

DROP FUNCTION IF EXISTS public.generate_order_number()            CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at()                CASCADE;
DROP FUNCTION IF EXISTS public.newsletter_set_normalized_email()  CASCADE;
DROP FUNCTION IF EXISTS public.newsletter_set_queue_timestamps()  CASCADE;
DROP FUNCTION IF EXISTS public.is_admin()                         CASCADE;
DROP FUNCTION IF EXISTS public.decrement_product_stock_atomic(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS public.decrement_variant_stock_atomic(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS public.get_available_stock(UUID)          CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_reservations()     CASCADE;
DROP FUNCTION IF EXISTS public.update_reservation_qty(TEXT, UUID, UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS public.update_reservation_qty(TEXT, UUID, INT)       CASCADE;
DROP FUNCTION IF EXISTS public.restore_order_stock(UUID)          CASCADE;
DROP FUNCTION IF EXISTS public.admin_delete_coupon(UUID)          CASCADE;
DROP FUNCTION IF EXISTS public.checkout_reserve_stock_and_order(JSONB, UUID, TEXT, TEXT, NUMERIC, JSONB, UUID, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS public.create_order_from_webhook(TEXT, TEXT, UUID, TEXT, NUMERIC, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
-- Funciones residuales de migraciones anteriores
DROP FUNCTION IF EXISTS public.set_updated_at()                      CASCADE;
DROP FUNCTION IF EXISTS public.transfer_guest_cart_to_user(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_guest_cart_to_user(TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.release_expired_reservations()         CASCADE;
DROP FUNCTION IF EXISTS public._cleanup_expired_reservations()        CASCADE;

DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS user_role    CASCADE;

-- ============================================================
-- EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending', 'confirmed', 'processing', 'shipped',
    'delivered', 'cancelled', 'refunded', 'partial_return'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLAS
-- ============================================================

-- USERS
CREATE TABLE IF NOT EXISTS public.users (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT        NOT NULL,
    email       TEXT        UNIQUE NOT NULL,
    password    TEXT,
    role        user_role   DEFAULT 'customer',
    phone       TEXT,
    avatar_url  TEXT,
    is_active   BOOLEAN     DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
    id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    name          TEXT    UNIQUE NOT NULL,
    slug          TEXT    UNIQUE NOT NULL,
    description   TEXT,
    image_url     TEXT,
    display_order INT     DEFAULT 0,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name              TEXT        NOT NULL,
    slug              TEXT        UNIQUE NOT NULL,
    description       TEXT        NOT NULL,
    short_description TEXT,
    price             NUMERIC(10,2) NOT NULL,
    compare_price     NUMERIC(10,2),
    cost              NUMERIC(10,2),
    category_id       UUID        REFERENCES categories(id) ON DELETE SET NULL,
    image             TEXT        NOT NULL,
    stock             INT         NOT NULL DEFAULT 0,
    sku               TEXT        UNIQUE,
    brand             TEXT        DEFAULT 'EliteGrip',
    is_featured       BOOLEAN     DEFAULT false,
    is_active         BOOLEAN     DEFAULT true,
    meta_title        TEXT,
    meta_description  TEXT,
    display_order     INT         DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

-- PRODUCT_IMAGES
CREATE TABLE IF NOT EXISTS public.product_images (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url           TEXT NOT NULL,
    alt_text      TEXT,
    display_order INT  DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- PRODUCT_VARIANTS
CREATE TABLE IF NOT EXISTS public.product_variants (
    id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id     UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size           TEXT          NOT NULL,
    stock          INT           NOT NULL DEFAULT 0,
    sku            TEXT,
    price_override NUMERIC(10,2),
    is_active      BOOLEAN       DEFAULT true,
    created_at     TIMESTAMPTZ   DEFAULT now()
);

-- ADDRESSES
CREATE TABLE IF NOT EXISTS public.addresses (
    id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       TEXT    DEFAULT 'Casa',
    full_name   TEXT    NOT NULL,
    street      TEXT    NOT NULL,
    city        TEXT    NOT NULL,
    state       TEXT,
    postal_code TEXT    NOT NULL,
    country     TEXT    DEFAULT 'España',
    phone       TEXT,
    is_default  BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- CARTS
CREATE TABLE IF NOT EXISTS public.carts (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- CART_ITEMS
CREATE TABLE IF NOT EXISTS public.cart_items (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cart_id    UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity   INT  NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- COUPONS  (columnas reales: type, value, min_purchase, is_exclusive)
CREATE TABLE IF NOT EXISTS public.coupons (
    id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    code        TEXT          UNIQUE NOT NULL,
    description TEXT,
    type        TEXT          NOT NULL CHECK (type IN ('percentage', 'fixed')),
    value       NUMERIC(10,2) NOT NULL,
    min_purchase NUMERIC(10,2) DEFAULT 0,
    max_uses    INT,
    times_used  INT           DEFAULT 0,
    is_active   BOOLEAN       DEFAULT true,
    is_exclusive BOOLEAN      NOT NULL DEFAULT false,
    starts_at   TIMESTAMPTZ   DEFAULT now(),
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ   DEFAULT now()
);

-- COUPON_USER_ALLOWLIST
CREATE TABLE IF NOT EXISTS public.coupon_user_allowlist (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    coupon_id  UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (coupon_id, user_id)
);

-- ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    id                      UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                 UUID          REFERENCES users(id),
    order_number            TEXT          UNIQUE NOT NULL,
    status                  order_status  DEFAULT 'pending',
    subtotal                NUMERIC(10,2) NOT NULL,
    discount                NUMERIC(10,2) DEFAULT 0,
    shipping_cost           NUMERIC(10,2) DEFAULT 0,
    total                   NUMERIC(10,2) NOT NULL,
    coupon_id               UUID          REFERENCES coupons(id) ON DELETE SET NULL,
    email                   TEXT,
    email_sent              BOOLEAN       NOT NULL DEFAULT false,
    stripe_session_id       TEXT,
    stripe_payment_intent_id TEXT,
    stripe_charge_id        TEXT,
    fraud_risk_level        TEXT,
    fraud_review_required   BOOLEAN       NOT NULL DEFAULT false,
    payment_outcome_type    TEXT,
    shipping_name           TEXT,
    shipping_street         TEXT,
    shipping_city           TEXT,
    shipping_state          TEXT,
    shipping_postal_code    TEXT,
    shipping_country        TEXT          DEFAULT 'España',
    shipping_phone          TEXT,
    tracking_number         TEXT,
    tracking_url            TEXT,
    notes                   TEXT,
    created_at              TIMESTAMPTZ   DEFAULT now(),
    updated_at              TIMESTAMPTZ   DEFAULT now()
);

-- ORDER_ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
    id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id      UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id    UUID          REFERENCES products(id),
    variant_id    UUID          REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name  TEXT          NOT NULL,
    product_image TEXT,
    size          TEXT,
    quantity      INT           NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(10,2) NOT NULL,
    total_price   NUMERIC(10,2) NOT NULL,
    name          TEXT,
    image         TEXT,
    created_at    TIMESTAMPTZ   DEFAULT now()
);

-- COUPON_USAGE
CREATE TABLE IF NOT EXISTS public.coupon_usage (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    coupon_id  UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    used_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (coupon_id, user_id)
);

-- REVIEWS
CREATE TABLE IF NOT EXISTS public.reviews (
    id           UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id   UUID    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id      UUID    NOT NULL REFERENCES users(id),
    rating       INT     NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title        TEXT,
    comment      TEXT,
    is_verified  BOOLEAN DEFAULT false,
    is_approved  BOOLEAN DEFAULT false,
    is_featured  BOOLEAN DEFAULT false,
    order_id     UUID    REFERENCES orders(id),
    order_item_id UUID   REFERENCES order_items(id),
    unit_index   INT     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- ADMIN_LOGS
CREATE TABLE IF NOT EXISTS public.admin_logs (
    id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id    UUID    NOT NULL REFERENCES users(id),
    action      TEXT    NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    details     JSONB   DEFAULT '{}',
    ip_address  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- SITE_SETTINGS
CREATE TABLE IF NOT EXISTS public.site_settings (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key        TEXT UNIQUE NOT NULL,
    value      JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- PAGE_SETTINGS
CREATE TABLE IF NOT EXISTS public.page_settings (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    page_key          TEXT UNIQUE NOT NULL,
    settings          JSONB DEFAULT '{}',
    published_settings JSONB,
    published_at      TIMESTAMPTZ,
    version           INT  DEFAULT 1,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

-- PAGE_SECTIONS
CREATE TABLE IF NOT EXISTS public.page_sections (
    id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    page_name     TEXT    NOT NULL,
    section_key   TEXT    NOT NULL,
    label         TEXT    NOT NULL DEFAULT '',
    content       JSONB   NOT NULL DEFAULT '{}',
    display_order INT     NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (page_name, section_key)
);

-- SECTION_HISTORY
CREATE TABLE IF NOT EXISTS public.section_history (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    section_id  UUID REFERENCES page_sections(id),
    page_name   TEXT NOT NULL,
    section_key TEXT NOT NULL,
    content     JSONB NOT NULL,
    changed_by  UUID REFERENCES users(id),
    changed_at  TIMESTAMPTZ DEFAULT now()
);

-- FRAUD_LOGS
CREATE TABLE IF NOT EXISTS public.fraud_logs (
    id                 UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id            UUID          REFERENCES users(id),
    ip_address         TEXT,
    payment_intent_id  TEXT          NOT NULL,
    risk_level         TEXT,
    outcome_type       TEXT,
    details            JSONB         NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- RETURNS
CREATE TABLE IF NOT EXISTS public.returns (
    id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id       UUID          NOT NULL REFERENCES orders(id),
    user_id        UUID          NOT NULL REFERENCES users(id),
    reason         TEXT          NOT NULL,
    status         TEXT          NOT NULL DEFAULT 'pending',
    admin_notes    TEXT,
    refund_amount  NUMERIC,
    stripe_refund_id TEXT,
    images         TEXT[]        DEFAULT '{}',
    created_at     TIMESTAMPTZ   DEFAULT now(),
    updated_at     TIMESTAMPTZ   DEFAULT now()
);

-- RETURN_ITEMS
CREATE TABLE IF NOT EXISTS public.return_items (
    id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    return_id     UUID          NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    order_item_id UUID          NOT NULL REFERENCES order_items(id),
    product_name  TEXT          NOT NULL,
    product_image TEXT,
    size          TEXT,
    quantity      INT           NOT NULL,
    unit_price    NUMERIC(10,2) NOT NULL,
    total_price   NUMERIC(10,2) NOT NULL,
    created_at    TIMESTAMPTZ   DEFAULT now()
);

-- STOCK_RESERVATIONS (columna real: cart_session_id, NO session_id)
CREATE TABLE IF NOT EXISTS public.stock_reservations (
    id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    cart_session_id TEXT          NOT NULL,
    product_id      UUID          REFERENCES products(id) ON DELETE CASCADE,
    variant_id      UUID          REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity        INT           NOT NULL CHECK (quantity > 0),
    expires_at      TIMESTAMPTZ   DEFAULT (now() + INTERVAL '20 minutes'),
    created_at      TIMESTAMPTZ   DEFAULT now()
);

-- NEWSLETTER_SUBSCRIBERS
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
    id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    email            TEXT    NOT NULL,
    email_normalized TEXT    UNIQUE NOT NULL,
    user_id          UUID    REFERENCES users(id),
    subscribed       BOOLEAN NOT NULL DEFAULT true,
    source           TEXT    NOT NULL DEFAULT 'website',
    unsubscribed_at  TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NEWSLETTER_EMAIL_QUEUE
CREATE TABLE IF NOT EXISTS public.newsletter_email_queue (
    id                    UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    subscriber_id         UUID    REFERENCES newsletter_subscribers(id),
    to_email              TEXT    NOT NULL,
    subject               TEXT    NOT NULL,
    html_content          TEXT    NOT NULL,
    text_content          TEXT,
    payload               JSONB   NOT NULL DEFAULT '{}',
    status                TEXT    NOT NULL DEFAULT 'pending',
    attempts              INT     NOT NULL DEFAULT 0,
    max_attempts          INT     NOT NULL DEFAULT 3,
    event_key             TEXT,
    scheduled_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_started_at TIMESTAMPTZ,
    sent_at               TIMESTAMPTZ,
    last_error            TEXT,
    provider_message_id   TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NEWSLETTER_EVENT_DISPATCHES
CREATE TABLE IF NOT EXISTS public.newsletter_event_dispatches (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_key    TEXT UNIQUE NOT NULL,
    event_type   TEXT NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}',
    queued_count INT   NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NEWSLETTER_QUEUE_LOGS
CREATE TABLE IF NOT EXISTS public.newsletter_queue_logs (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    queue_id   UUID REFERENCES newsletter_email_queue(id),
    event      TEXT NOT NULL,
    level      TEXT NOT NULL,
    message    TEXT NOT NULL,
    metadata   JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PRO_GOALKEEPERS
CREATE TABLE IF NOT EXISTS public.pro_goalkeepers (
    id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    name          TEXT    NOT NULL,
    team          TEXT    NOT NULL,
    league        TEXT    NOT NULL,
    image_url     TEXT    NOT NULL,
    display_order INT     DEFAULT 0,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

CREATE INDEX IF NOT EXISTS idx_products_category     ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug         ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_display_order ON products(display_order);

CREATE INDEX IF NOT EXISTS idx_product_images_product   ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id    ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON cart_items(variant_id);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_intent_id
    ON orders(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_unique
    ON orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_user_id      ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email        ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_coupon_id    ON orders(coupon_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_fraud_risk   ON orders(fraud_risk_level) WHERE fraud_risk_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_fraud_review ON orders(fraud_review_required) WHERE fraud_review_required = true;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON order_items(variant_id);

CREATE INDEX IF NOT EXISTS idx_coupon_usage_user_id  ON coupon_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_order_id ON coupon_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_cupal_coupon_id ON coupon_user_allowlist(coupon_id);
CREATE INDEX IF NOT EXISTS idx_cupal_user_id   ON coupon_user_allowlist(user_id);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id    ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_featured        ON reviews(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_reviews_order_id       ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_item_id  ON reviews(order_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_order_item_unit_unique
    ON reviews(user_id, order_item_id, unit_index) WHERE order_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);

CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_user_id  ON returns(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_status   ON returns(status);
CREATE INDEX IF NOT EXISTS idx_return_items_return_id     ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_order_item_id ON return_items(order_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS unique_session_product_variant
    ON stock_reservations(cart_session_id, product_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_expires      ON stock_reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product_id ON stock_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_variant_id  ON stock_reservations(variant_id);

CREATE INDEX IF NOT EXISTS idx_fraud_logs_user          ON fraud_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fraud_logs_payment_intent ON fraud_logs(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_fraud_logs_risk_level    ON fraud_logs(risk_level) WHERE risk_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fraud_logs_created_at    ON fraud_logs(created_at DESC);

-- idx_newsletter_subscribers_email_normalized_unique eliminado:
-- la restricción UNIQUE en la columna ya crea su propio índice automáticamente
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_subscribed
    ON newsletter_subscribers(subscribed) WHERE subscribed = true;
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_user_id ON newsletter_subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_updated_at ON newsletter_subscribers(updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_email_queue_event_email_uq
    ON newsletter_email_queue(event_key, to_email);
CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_subscriber_id ON newsletter_email_queue(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_status_scheduled ON newsletter_email_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_to_email ON newsletter_email_queue(to_email);
CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_created_at ON newsletter_email_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_event_dispatches_event_type_created
    ON newsletter_event_dispatches(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_queue_logs_queue_id_created ON newsletter_queue_logs(queue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_queue_logs_event_created     ON newsletter_queue_logs(event, created_at DESC);

-- page_sections_unique eliminado: la restricción UNIQUE en la tabla ya crea el índice
CREATE INDEX IF NOT EXISTS idx_page_sections_order ON page_sections(page_name, display_order);

CREATE INDEX IF NOT EXISTS idx_section_history_section    ON section_history(section_id);
CREATE INDEX IF NOT EXISTS idx_section_history_changed_by ON section_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_section_history_date       ON section_history(changed_at DESC);

-- ============================================================
-- FUNCIONES Y TRIGGERS
-- ============================================================

-- Auto generate order_number (EG-0000001)
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
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE TRIGGER set_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
    EXECUTE FUNCTION generate_order_number();

-- Auto update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE TRIGGER update_users_updated_at     BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER update_products_updated_at  BEFORE UPDATE ON products     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER update_carts_updated_at     BEFORE UPDATE ON carts        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER update_orders_updated_at    BEFORE UPDATE ON orders       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER update_returns_updated_at   BEFORE UPDATE ON returns      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Newsletter normalize email trigger
CREATE OR REPLACE FUNCTION newsletter_set_normalized_email()
RETURNS TRIGGER AS $$
BEGIN
    NEW.email := lower(trim(NEW.email));
    NEW.email_normalized := lower(trim(NEW.email));
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE TRIGGER newsletter_normalize_email
    BEFORE INSERT OR UPDATE ON newsletter_subscribers
    FOR EACH ROW EXECUTE FUNCTION newsletter_set_normalized_email();

CREATE OR REPLACE FUNCTION newsletter_set_queue_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.to_email := lower(trim(NEW.to_email));
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE TRIGGER newsletter_queue_timestamps
    BEFORE INSERT OR UPDATE ON newsletter_email_queue
    FOR EACH ROW EXECUTE FUNCTION newsletter_set_queue_timestamps();

-- Helper: is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT role = 'admin'
    FROM public.users
    WHERE id = auth.uid()
  );
END;
$$;

-- Atomic stock functions
CREATE OR REPLACE FUNCTION public.decrement_product_stock_atomic(product_id UUID, quantity INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE products SET stock = stock - quantity
    WHERE id = product_id AND stock >= quantity;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_variant_stock_atomic(variant_id UUID, quantity INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE product_variants SET stock = stock - quantity
    WHERE id = variant_id AND stock >= quantity;
    RETURN FOUND;
END;
$$;

-- get_available_stock
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

-- cleanup_expired_reservations
CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM stock_reservations WHERE expires_at < now();
END;
$$;

-- update_reservation_qty (con variant_id)
CREATE OR REPLACE FUNCTION public.update_reservation_qty(
    p_session_id  TEXT,
    p_product_id  UUID,
    p_variant_id  UUID,
    p_qty_diff    INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_qty_diff > 0 THEN
        INSERT INTO stock_reservations (cart_session_id, product_id, variant_id, quantity)
        VALUES (p_session_id, p_product_id, p_variant_id, p_qty_diff)
        ON CONFLICT (cart_session_id, product_id, variant_id)
        DO UPDATE SET
            quantity   = stock_reservations.quantity + EXCLUDED.quantity,
            expires_at = now() + interval '20 minutes'
        WHERE stock_reservations.cart_session_id = p_session_id
          AND stock_reservations.product_id = p_product_id
          AND (stock_reservations.variant_id IS NOT DISTINCT FROM p_variant_id);
    ELSE
        UPDATE stock_reservations
        SET quantity   = quantity + p_qty_diff,
            expires_at = now() + interval '20 minutes'
        WHERE cart_session_id = p_session_id
          AND product_id = p_product_id
          AND (variant_id IS NOT DISTINCT FROM p_variant_id);
    END IF;

    DELETE FROM stock_reservations
    WHERE cart_session_id = p_session_id
      AND product_id = p_product_id
      AND (variant_id IS NOT DISTINCT FROM p_variant_id)
      AND quantity <= 0;
END;
$$;

-- update_reservation_qty (sin variant_id)
CREATE OR REPLACE FUNCTION public.update_reservation_qty(
    p_session_id TEXT,
    p_product_id UUID,
    p_qty_diff   INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_qty_diff > 0 THEN
        INSERT INTO stock_reservations (cart_session_id, product_id, quantity)
        VALUES (p_session_id, p_product_id, p_qty_diff)
        ON CONFLICT (cart_session_id, product_id)
        DO UPDATE SET
            quantity   = stock_reservations.quantity + EXCLUDED.quantity,
            expires_at = now() + interval '20 minutes'
        WHERE stock_reservations.cart_session_id = p_session_id
          AND stock_reservations.product_id = p_product_id;
    ELSE
        UPDATE stock_reservations
        SET quantity   = quantity + p_qty_diff,
            expires_at = now() + interval '20 minutes'
        WHERE cart_session_id = p_session_id
          AND product_id     = p_product_id;
    END IF;

    DELETE FROM stock_reservations
    WHERE cart_session_id = p_session_id
      AND product_id = p_product_id
      AND quantity <= 0;
END;
$$;

-- restore_order_stock
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
        UPDATE products SET stock = stock + v_item.quantity WHERE id = v_item.product_id;
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE product_variants SET stock = stock + v_item.quantity WHERE id = v_item.variant_id;
        END IF;
    END LOOP;
END;
$$;

-- admin_delete_coupon
CREATE OR REPLACE FUNCTION public.admin_delete_coupon(p_coupon_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.orders SET coupon_id = NULL WHERE coupon_id = p_coupon_id;
    DELETE FROM public.coupon_usage         WHERE coupon_id = p_coupon_id;
    DELETE FROM public.coupon_user_allowlist WHERE coupon_id = p_coupon_id;
    DELETE FROM public.coupons              WHERE id = p_coupon_id;
END;
$$;

-- checkout_reserve_stock_and_order
CREATE OR REPLACE FUNCTION public.checkout_reserve_stock_and_order(
    p_items             JSONB,
    p_user_id           UUID,
    p_email             TEXT,
    p_payment_intent_id TEXT,
    p_amount_total      NUMERIC,
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
    -- Idempotencia
    IF p_payment_intent_id IS NOT NULL AND p_payment_intent_id <> '' THEN
        SELECT id INTO v_order_id FROM orders
        WHERE stripe_payment_intent_id = p_payment_intent_id LIMIT 1;
        IF v_order_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'already_exists', true);
        END IF;
    END IF;

    -- Validar cupón
    IF p_coupon_id IS NOT NULL THEN
        SELECT max_uses, times_used INTO v_coupon_max_uses, v_coupon_times_used
        FROM coupons WHERE id = p_coupon_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cupón no encontrado.');
        END IF;
        IF v_coupon_max_uses IS NOT NULL AND v_coupon_times_used >= v_coupon_max_uses THEN
            RETURN jsonb_build_object('success', false, 'error', 'Este cupón ha alcanzado su límite de uso.');
        END IF;
    END IF;

    -- Validar stock + precios desde BD
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'id')::UUID;
        v_quantity   := (v_item->>'quantity')::INT;
        v_variant_id :=  v_item->>'variantId';

        IF v_quantity IS NULL OR v_quantity < 1 OR v_quantity > 100 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cantidad inválida.', 'failed_product_id', v_product_id);
        END IF;

        IF v_variant_id IS NOT NULL AND v_variant_id <> '' THEN
            SELECT pv.stock, COALESCE(pv.price_override, p.price)
            INTO v_current_stock, v_db_price
            FROM product_variants pv JOIN products p ON p.id = pv.product_id
            WHERE pv.id = v_variant_id::UUID FOR UPDATE OF pv;
        ELSE
            SELECT stock, price INTO v_current_stock, v_db_price FROM products WHERE id = v_product_id FOR UPDATE;
        END IF;

        IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
            RETURN jsonb_build_object('success', false, 'error', 'Stock insuficiente.', 'failed_product_id', v_product_id);
        END IF;
        v_subtotal := v_subtotal + (v_db_price * v_quantity);
    END LOOP;

    -- Calcular totales
    v_discount := GREATEST(0, LEAST(COALESCE(p_discount_amount, 0), v_subtotal));
    v_total    := v_subtotal - v_discount;

    -- Crear orden
    INSERT INTO orders (
        user_id, email, status, subtotal, discount, total, shipping_cost,
        coupon_id, stripe_payment_intent_id,
        shipping_name, shipping_street, shipping_city, shipping_postal_code, shipping_phone, created_at
    ) VALUES (
        p_user_id, p_email, 'processing',
        v_subtotal, v_discount, v_total, 0, p_coupon_id,
        NULLIF(p_payment_intent_id, ''),
        TRIM((p_shipping_info->>'firstName') || ' ' || COALESCE(p_shipping_info->>'lastName', '')),
        p_shipping_info->>'address', p_shipping_info->>'city',
        p_shipping_info->>'zip', p_shipping_info->>'phone', NOW()
    ) RETURNING id INTO v_order_id;

    -- Insertar items y decrementar stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'id')::UUID;
        v_quantity   := (v_item->>'quantity')::INT;
        v_variant_id :=  v_item->>'variantId';

        IF v_variant_id IS NOT NULL AND v_variant_id <> '' THEN
            SELECT COALESCE(pv.price_override, p.price) INTO v_db_price
            FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = v_variant_id::UUID;
        ELSE
            SELECT price INTO v_db_price FROM products WHERE id = v_product_id;
        END IF;

        INSERT INTO order_items (
            order_id, product_id, variant_id, quantity, unit_price, total_price,
            product_name, product_image, size
        ) VALUES (
            v_order_id, v_product_id,
            CASE WHEN v_variant_id IS NOT NULL AND v_variant_id <> '' THEN v_variant_id::UUID ELSE NULL END,
            v_quantity, v_db_price, v_db_price * v_quantity,
            COALESCE(v_item->>'name', 'Producto'), COALESCE(v_item->>'image', ''), v_item->>'size'
        );

        IF v_variant_id IS NOT NULL AND v_variant_id <> '' THEN
            UPDATE product_variants SET stock = stock - v_quantity WHERE id = v_variant_id::UUID;
            UPDATE products          SET stock = stock - v_quantity WHERE id = v_product_id;
        ELSE
            UPDATE products SET stock = stock - v_quantity WHERE id = v_product_id;
        END IF;
    END LOOP;

    -- Registrar cupón
    IF p_coupon_id IS NOT NULL THEN
        UPDATE coupons SET times_used = times_used + 1 WHERE id = p_coupon_id;
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

-- create_order_from_webhook
CREATE OR REPLACE FUNCTION public.create_order_from_webhook(
    p_stripe_session_id TEXT,
    p_stripe_charge_id  TEXT,
    p_user_id           UUID,
    p_email             TEXT,
    p_amount_total      NUMERIC,
    p_items             JSONB,
    p_shipping_name     TEXT,
    p_shipping_street   TEXT,
    p_shipping_city     TEXT,
    p_shipping_postal   TEXT,
    p_shipping_phone    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id    UUID;
    v_item        JSONB;
    v_product_id  UUID;
    v_variant_id  UUID;
    v_quantity    INT;
    v_stock_ok    BOOLEAN;
    v_stock_issue BOOLEAN := false;
BEGIN
    -- Idempotencia
    SELECT id INTO v_order_id FROM orders WHERE stripe_session_id = p_stripe_session_id LIMIT 1;
    IF v_order_id IS NOT NULL THEN
        RETURN jsonb_build_object('already_exists', true, 'order_id', v_order_id);
    END IF;

    INSERT INTO orders (
        stripe_session_id, stripe_charge_id,
        user_id, email, status,
        subtotal, total,
        shipping_name, shipping_street, shipping_city, shipping_postal_code, shipping_phone
    ) VALUES (
        p_stripe_session_id, NULLIF(p_stripe_charge_id, ''),
        p_user_id, p_email, 'pending',
        p_amount_total, p_amount_total,
        p_shipping_name, p_shipping_street, p_shipping_city, p_shipping_postal, p_shipping_phone
    ) RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity   := (v_item->>'quantity')::INT;
        v_variant_id := CASE WHEN NULLIF(v_item->>'variant_id', '') IS NOT NULL
                        THEN (v_item->>'variant_id')::UUID ELSE NULL END;

        INSERT INTO order_items (
            order_id, product_id, variant_id,
            product_name, product_image, size,
            quantity, unit_price, total_price
        ) VALUES (
            v_order_id, v_product_id, v_variant_id,
            v_item->>'product_name', v_item->>'product_image', v_item->>'size',
            v_quantity,
            (v_item->>'unit_price')::NUMERIC,
            (v_item->>'total_price')::NUMERIC
        );

        IF v_variant_id IS NOT NULL THEN
            UPDATE product_variants SET stock = stock - v_quantity WHERE id = v_variant_id AND stock >= v_quantity;
            v_stock_ok := FOUND;
            IF v_stock_ok THEN
                UPDATE products SET stock = stock - v_quantity WHERE id = v_product_id;
            END IF;
        ELSE
            UPDATE products SET stock = stock - v_quantity WHERE id = v_product_id AND stock >= v_quantity;
            v_stock_ok := FOUND;
        END IF;

        IF NOT v_stock_ok THEN v_stock_issue := true; END IF;
    END LOOP;

    IF v_stock_issue THEN
        UPDATE orders SET notes = 'STOCK_ISSUE: Revisar inventario.' WHERE id = v_order_id;
    END IF;

    RETURN jsonb_build_object('already_exists', false, 'order_id', v_order_id, 'stock_issue', v_stock_issue);

EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_order_id FROM orders WHERE stripe_session_id = p_stripe_session_id LIMIT 1;
    RETURN jsonb_build_object('already_exists', true, 'order_id', v_order_id);
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images          ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usage            ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_user_allowlist   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_sections           ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_email_queue  ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_event_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_queue_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_goalkeepers         ENABLE ROW LEVEL SECURITY;

-- USERS
CREATE POLICY "users_select_own"   ON users FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY "users_update_own"   ON users FOR UPDATE TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "users_admin_all_safe" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- CATEGORIES
CREATE POLICY "categories_select_active" ON categories FOR SELECT TO public USING (is_active = true);

-- PRODUCTS
CREATE POLICY "products_select_active" ON products FOR SELECT TO public USING (is_active = true);

-- PRODUCT_IMAGES
CREATE POLICY "product_images_select" ON product_images FOR SELECT TO public USING (true);

-- PRODUCT_VARIANTS
CREATE POLICY "product_variants_select" ON product_variants FOR SELECT TO public USING (true);

-- ADDRESSES
CREATE POLICY "addresses_select_own" ON addresses FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "addresses_insert_own" ON addresses FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "addresses_update_own" ON addresses FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "addresses_delete_own" ON addresses FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- CARTS
CREATE POLICY "carts_own" ON carts FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- CART_ITEMS
CREATE POLICY "cart_items_own" ON cart_items FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM carts WHERE carts.id = cart_items.cart_id AND carts.user_id = (SELECT auth.uid())));

-- COUPONS
CREATE POLICY "coupons_select_active" ON coupons FOR SELECT TO authenticated USING (is_active = true);

-- COUPON_USAGE
CREATE POLICY "coupon_usage_own" ON coupon_usage FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- COUPON_USER_ALLOWLIST
CREATE POLICY "cupal_own_select" ON coupon_user_allowlist FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- ORDERS
CREATE POLICY "orders_select_own" ON orders FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) OR email ~~* (SELECT users.email FROM users WHERE users.id = (SELECT auth.uid())));

-- ORDER_ITEMS
CREATE POLICY "order_items_select_own" ON order_items FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_items.order_id
          AND (orders.user_id = (SELECT auth.uid()) OR orders.email ~~* (SELECT users.email FROM users WHERE users.id = (SELECT auth.uid())))
    ));

-- REVIEWS
CREATE POLICY "reviews_approved_public" ON reviews FOR SELECT TO public USING (is_approved = true);
CREATE POLICY "reviews_insert_own"      ON reviews FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "reviews_update_own"      ON reviews FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ADMIN_LOGS
CREATE POLICY "Service role full access" ON admin_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SITE_SETTINGS
CREATE POLICY "Service role full access" ON site_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PAGE_SETTINGS
CREATE POLICY "Service role full access" ON page_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PAGE_SECTIONS
CREATE POLICY "Public read page_sections"         ON page_sections FOR SELECT TO public USING (true);
CREATE POLICY "Service role full access sections" ON page_sections FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SECTION_HISTORY
CREATE POLICY "Service role full access history" ON section_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- FRAUD_LOGS
CREATE POLICY "fraud_logs_service_role" ON fraud_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RETURNS
CREATE POLICY "service_role_full_access" ON returns FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RETURN_ITEMS
CREATE POLICY "service_role_only" ON return_items FOR ALL TO service_role USING (true) WITH CHECK (true);

-- STOCK_RESERVATIONS
CREATE POLICY "Service role full access" ON stock_reservations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- NEWSLETTER
CREATE POLICY "service_role_only" ON newsletter_email_queue     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON newsletter_event_dispatches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON newsletter_queue_logs      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "newsletter_subscribers_owner_read"   ON newsletter_subscribers FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "newsletter_subscribers_owner_update" ON newsletter_subscribers FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- PRO_GOALKEEPERS
CREATE POLICY "Allow public read"       ON pro_goalkeepers FOR SELECT TO anon, authenticated USING (is_active = true OR (SELECT is_admin()));
CREATE POLICY "Service role full access" ON pro_goalkeepers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SEED DATA — Categorías y productos (igual que la BD actual)
-- ============================================================
INSERT INTO categories (name, slug, description, display_order) VALUES
('Elite',        'elite',        'Guantes profesionales de competición para porteros de alto rendimiento', 1),
('Entrenamiento','entrenamiento','Guantes resistentes diseñados para sesiones de entrenamiento intensivo', 2),
('Infantil',     'infantil',     'Guantes adaptados para jóvenes porteros en formación', 3),
('Accesorios',   'accesorios',   'Complementos esenciales para el cuidado y rendimiento del portero', 4)
ON CONFLICT DO NOTHING;

INSERT INTO coupons (code, description, type, value, min_purchase, max_uses, expires_at) VALUES
('BIENVENIDO10', '10% de descuento en tu primera compra', 'percentage', 10, 30, NULL, '2027-01-01'),
('ENVIOGRATIS',  'Envío gratis en pedidos +60€',          'fixed',      5.99, 60, 100, '2026-12-31')
ON CONFLICT DO NOTHING;
