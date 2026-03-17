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
