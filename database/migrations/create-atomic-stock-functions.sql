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
