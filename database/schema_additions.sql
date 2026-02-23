-- ============================================================
-- STOCK RESERVATION SYSTEM — Ejecutar después de schema.sql
-- Sistema de reservas con timeout de 15 minutos.
-- Previene overselling con bloqueo a nivel de fila (FOR UPDATE).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: stock_reservations
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_reservations (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id  TEXT        NOT NULL,
    product_id  UUID        NOT NULL REFERENCES products(id)          ON DELETE CASCADE,
    variant_id  UUID                 REFERENCES product_variants(id)  ON DELETE CASCADE,
    quantity    INT         NOT NULL CHECK (quantity > 0),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes'),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reservations_session
    ON stock_reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_reservations_product_variant
    ON stock_reservations(product_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_expires
    ON stock_reservations(expires_at);

-- RLS
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON stock_reservations;
CREATE POLICY "Allow all" ON stock_reservations FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- RPC: get_available_stock
-- Retorna el stock real disponible (total - reservas activas).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_available_stock(
    p_product_id UUID,
    p_variant_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stock    INT;
    v_reserved INT;
BEGIN
    -- 1. Stock físico
    IF p_variant_id IS NOT NULL THEN
        SELECT stock INTO v_stock
        FROM product_variants
        WHERE id = p_variant_id;
    ELSE
        SELECT stock INTO v_stock
        FROM products
        WHERE id = p_product_id;
    END IF;

    IF v_stock IS NULL THEN
        RETURN 0;
    END IF;

    -- 2. Reservas activas totales para este producto/variante
    SELECT COALESCE(SUM(quantity), 0) INTO v_reserved
    FROM stock_reservations
    WHERE product_id = p_product_id
      AND variant_id IS NOT DISTINCT FROM p_variant_id
      AND expires_at > now();

    RETURN GREATEST(0, v_stock - v_reserved);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: update_reservation_qty  ← CORAZÓN DEL SISTEMA
-- Reserva o libera stock de forma ATÓMICA usando FOR UPDATE.
-- Dos usuarios concurrentes nunca podrán oversell.
--
-- Devuelve JSONB:
--   { success: true,  quantity: <new_qty> }
--   { success: false, error: <msg>, available?: <n> }
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_reservation_qty(
    p_session_id TEXT,
    p_product_id UUID,
    p_variant_id UUID,
    p_qty_diff   INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stock            INT;
    v_reserved_others  INT;
    v_available        INT;
    v_current_qty      INT := 0;
    v_new_qty          INT;
    v_reservation_id   UUID;
BEGIN
    -- 1. Limpiar reservas caducadas
    DELETE FROM stock_reservations WHERE expires_at <= now();

    -- 2. Bloquear la fila del producto/variante para evitar race conditions
    IF p_variant_id IS NOT NULL THEN
        SELECT stock INTO v_stock
        FROM product_variants
        WHERE id = p_variant_id
        FOR UPDATE;
    ELSE
        SELECT stock INTO v_stock
        FROM products
        WHERE id = p_product_id
        FOR UPDATE;
    END IF;

    IF v_stock IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Producto no encontrado');
    END IF;

    -- 3. Reserva actual de ESTA sesión
    SELECT id, quantity
    INTO v_reservation_id, v_current_qty
    FROM stock_reservations
    WHERE session_id = p_session_id
      AND product_id = p_product_id
      AND variant_id IS NOT DISTINCT FROM p_variant_id;

    v_new_qty := COALESCE(v_current_qty, 0) + p_qty_diff;

    -- 4. Si la nueva cantidad es <= 0 → eliminar reserva
    IF v_new_qty <= 0 THEN
        DELETE FROM stock_reservations
        WHERE session_id = p_session_id
          AND product_id = p_product_id
          AND variant_id IS NOT DISTINCT FROM p_variant_id;

        RETURN jsonb_build_object('success', true, 'quantity', 0);
    END IF;

    -- 5. Solo validar stock cuando se INCREMENTA la cantidad
    IF p_qty_diff > 0 THEN
        -- Reservas de OTRAS sesiones (no la nuestra)
        SELECT COALESCE(SUM(quantity), 0)
        INTO v_reserved_others
        FROM stock_reservations
        WHERE product_id  = p_product_id
          AND variant_id  IS NOT DISTINCT FROM p_variant_id
          AND session_id  != p_session_id
          AND expires_at  > now();

        -- Stock disponible para esta sesión = total - reservas de otros
        -- (la reserva propia ya existente NO cuenta en contra de sí misma)
        v_available := v_stock - v_reserved_others;

        IF v_new_qty > v_available THEN
            RETURN jsonb_build_object(
                'success',   false,
                'error',     'Stock insuficiente',
                'available', GREATEST(0, v_available - COALESCE(v_current_qty, 0))
            );
        END IF;
    END IF;

    -- 6. Upsert de la reserva
    IF v_reservation_id IS NOT NULL THEN
        UPDATE stock_reservations
        SET quantity   = v_new_qty,
            expires_at = now() + INTERVAL '15 minutes',
            updated_at = now()
        WHERE id = v_reservation_id;
    ELSE
        INSERT INTO stock_reservations
            (session_id, product_id, variant_id, quantity, expires_at)
        VALUES
            (p_session_id, p_product_id, p_variant_id, v_new_qty, now() + INTERVAL '15 minutes');
    END IF;

    RETURN jsonb_build_object('success', true, 'quantity', v_new_qty);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: transfer_guest_cart_to_user
-- Fusiona las reservas de sesión invitada → sesión autenticada.
-- Llamar en el login después de hacer merge del localStorage.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transfer_guest_cart_to_user(
    p_guest_session_id TEXT,
    p_user_session_id  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- a) Sumar cantidades donde ya existe reserva del usuario
    UPDATE stock_reservations AS usr
    SET quantity   = usr.quantity + guest.quantity,
        expires_at = GREATEST(usr.expires_at, guest.expires_at),
        updated_at = now()
    FROM stock_reservations AS guest
    WHERE guest.session_id = p_guest_session_id
      AND usr.session_id   = p_user_session_id
      AND usr.product_id   = guest.product_id
      AND usr.variant_id   IS NOT DISTINCT FROM guest.variant_id;

    -- b) Eliminar las del invitado que ya se fusionaron
    DELETE FROM stock_reservations
    WHERE session_id = p_guest_session_id
      AND EXISTS (
          SELECT 1 FROM stock_reservations
          WHERE session_id = p_user_session_id
            AND product_id = stock_reservations.product_id
            AND variant_id IS NOT DISTINCT FROM stock_reservations.variant_id
      );

    -- c) Reasignar las restantes al usuario
    UPDATE stock_reservations
    SET session_id = p_user_session_id,
        updated_at = now()
    WHERE session_id = p_guest_session_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: release_expired_reservations  (ejecutar con pg_cron)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted INT;
BEGIN
    DELETE FROM stock_reservations WHERE expires_at <= now();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Trigger de autolimpieza — elimina caducadas en cada INSERT
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _cleanup_expired_reservations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM stock_reservations
    WHERE expires_at <= now()
      AND id != NEW.id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_cleanup_reservations ON stock_reservations;
CREATE TRIGGER auto_cleanup_reservations
    AFTER INSERT ON stock_reservations
    FOR EACH ROW
    EXECUTE FUNCTION _cleanup_expired_reservations();

-- ────────────────────────────────────────────────────────────
-- OPCIONAL: pg_cron — limpieza automática cada 5 minutos
-- Activar desde Supabase Dashboard → Database → Extensions → pg_cron
-- ────────────────────────────────────────────────────────────
-- SELECT cron.schedule(
--     'release-expired-reservations',
--     '*/5 * * * *',
--     'SELECT release_expired_reservations()'
-- );
