-- ============================================================
-- MIGRATION: fix-webhook-atomicity.sql
-- Fixes BLOCKER 1 from the Launch-Readiness Audit.
--
-- Problems solved:
--   1. The SELECT → INSERT check in the webhook is NOT atomic.
--      A Stripe retry arriving before the first INSERT commits
--      can pass the check and create a duplicate order.
--   2. The order + order_items are inserted in separate JS loop
--      iterations — no enclosing transaction. A crash mid-loop
--      leaves an orphan order with missing items.
--
-- Solution:
--   A. Enforce the UNIQUE constraint at the DATABASE level so
--      a concurrent INSERT from a webhook retry is rejected
--      with a unique_violation (23505), regardless of timing.
--   B. A single RPC (create_order_from_webhook) wraps the
--      order INSERT + all order_items INSERTs + stock
--      decrements inside one implicit plpgsql transaction.
--      Either everything commits or everything rolls back.
-- ============================================================

-- ── A. Guarantee the UNIQUE constraint exists ───────────────
-- IF NOT EXISTS makes this safe to run even if the original
-- migration already created the column as TEXT UNIQUE.
-- The partial index allows multiple NULLs (guest checkouts)
-- while still rejecting two identical non-NULL session IDs.
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_unique
    ON public.orders (stripe_session_id)
    WHERE stripe_session_id IS NOT NULL;


-- ── B. Atomic order-creation RPC ────────────────────────────
-- Called by the Stripe webhook instead of sequential inserts.
-- One plpgsql call = one implicit transaction. On any error
-- (including a unique_violation race) everything rolls back.
--
-- p_items format (JSONB array):
-- [
--   {
--     "product_id":   "uuid",
--     "variant_id":   "uuid-or-empty-string",
--     "product_name": "text",
--     "product_image":"url-or-null",
--     "size":         "text-or-null",
--     "quantity":     1,
--     "unit_price":   29.99,
--     "total_price":  29.99
--   }, ...
-- ]
-- ────────────────────────────────────────────────────────────
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
    -- The DB UNIQUE constraint is the last line of defence.
    -- This check avoids doing unnecessary work on known retries.
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
    -- All inside the same implicit transaction. If any INSERT
    -- fails (FK violation, etc.) the whole function rolls back.
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

        -- Atomic stock decrement: UPDATE only succeeds when
        -- stock >= quantity; FOUND tells us if it happened.
        IF v_variant_id IS NOT NULL THEN
            UPDATE product_variants
               SET stock = stock - v_quantity
             WHERE id    = v_variant_id
               AND stock >= v_quantity;
            v_stock_ok := FOUND;
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

    -- ── 4. Flag orders that had a stock shortfall ──────────
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

-- ── 5. Race-condition safety net ──────────────────────────
-- If two concurrent webhook deliveries both pass the SELECT
-- check above simultaneously, the second INSERT will violate
-- the UNIQUE constraint on stripe_session_id. We catch that
-- and return the already-created order cleanly instead of
-- propagating a 500.
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

-- Grant execution to the service_role used by supabaseAdmin
GRANT EXECUTE ON FUNCTION public.create_order_from_webhook(
    TEXT, TEXT, UUID, TEXT, NUMERIC,
    TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;
