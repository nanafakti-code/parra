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
