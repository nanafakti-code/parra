-- ============================================================
-- BUGFIX: products.stock no se sincronizaba al comprar variante
--
-- PROBLEMA: create_order_from_webhook solo decrementaba
-- product_variants.stock cuando había variant_id. El campo
-- products.stock (stock padre/agregado) no se actualizaba,
-- por lo que el panel de admin mostraba el stock sin cambios.
--
-- SOLUCIÓN: Igual que fix-variant-stock-decrement.sql — si el
-- ítem tiene variant_id, decrementar tanto product_variants.stock
-- como products.stock (padre).
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_order_from_webhook(
    p_stripe_session_id TEXT,
    p_stripe_charge_id  TEXT,
    p_user_id           UUID,
    p_email             TEXT,
    p_amount_total      NUMERIC,
    p_shipping_name     TEXT,
    p_shipping_street   TEXT,
    p_shipping_city     TEXT,
    p_shipping_postal   TEXT,
    p_shipping_phone    TEXT,
    p_items             JSONB
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
    -- ── 1. Application-level idempotency check ─────────────
    SELECT id INTO v_order_id
    FROM   orders
    WHERE  stripe_session_id = p_stripe_session_id
    LIMIT  1;

    IF v_order_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'already_exists', true,
            'order_id',       v_order_id
        );
    END IF;

    -- ── 2. Create the order row ────────────────────────────
    INSERT INTO orders (
        stripe_session_id, stripe_charge_id,
        user_id, email,
        status,
        subtotal, total,
        shipping_name,   shipping_street,
        shipping_city,   shipping_postal_code,
        shipping_phone
    ) VALUES (
        p_stripe_session_id, NULLIF(p_stripe_charge_id, ''),
        p_user_id, p_email,
        'pending',
        p_amount_total, p_amount_total,
        p_shipping_name,  p_shipping_street,
        p_shipping_city,  p_shipping_postal,
        p_shipping_phone
    )
    RETURNING id INTO v_order_id;

    -- ── 3. Insert every line-item + decrement stock ────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP

        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity   := (v_item->>'quantity')::INT;
        v_variant_id := CASE
            WHEN NULLIF(v_item->>'variant_id', '') IS NOT NULL
            THEN (v_item->>'variant_id')::UUID
            ELSE NULL
        END;

        INSERT INTO order_items (
            order_id,     product_id,   variant_id,
            product_name, product_image, size,
            quantity,     unit_price,   total_price
        ) VALUES (
            v_order_id,       v_product_id,   v_variant_id,
            v_item->>'product_name',
            v_item->>'product_image',
            v_item->>'size',
            v_quantity,
            (v_item->>'unit_price')::NUMERIC,
            (v_item->>'total_price')::NUMERIC
        );

        IF v_variant_id IS NOT NULL THEN
            -- Decrement variant stock
            UPDATE product_variants
               SET stock = stock - v_quantity
             WHERE id    = v_variant_id
               AND stock >= v_quantity;
            v_stock_ok := FOUND;

            -- Sync parent product stock too
            IF v_stock_ok THEN
                UPDATE products
                   SET stock = stock - v_quantity
                 WHERE id = v_product_id;
            END IF;
        ELSE
            UPDATE products
               SET stock = stock - v_quantity
             WHERE id    = v_product_id
               AND stock >= v_quantity;
            v_stock_ok := FOUND;
        END IF;

        IF NOT v_stock_ok THEN
            v_stock_issue := true;
        END IF;

    END LOOP;

    -- ── 4. Flag orders with stock shortfall ───────────────
    IF v_stock_issue THEN
        UPDATE orders
           SET notes = 'STOCK_ISSUE: Uno o más productos no '
                    || 'tenían stock suficiente al procesar el '
                    || 'pago. Revisar inventario.'
         WHERE id = v_order_id;
    END IF;

    RETURN jsonb_build_object(
        'already_exists', false,
        'order_id',       v_order_id,
        'stock_issue',    v_stock_issue
    );

EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_order_id
    FROM   orders
    WHERE  stripe_session_id = p_stripe_session_id
    LIMIT  1;

    RETURN jsonb_build_object(
        'already_exists', true,
        'order_id',       v_order_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_from_webhook(
    TEXT, TEXT, UUID, TEXT, NUMERIC,
    TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;
