-- ============================================================
-- BUGFIX: Stock de variantes no se decrementaba al comprar
-- Fecha: 2026-03-10
-- ============================================================
-- 
-- PROBLEMA: checkout_reserve_stock_and_order validaba y decrementaba
-- únicamente products.stock aunque el item tuviera variantId.
-- Los productos con tallas (product_variants) nunca veían su stock
-- reducido tras una compra.
--
-- SOLUCIÓN:
--  - Si el ítem tiene variantId → validar product_variants.stock
--    y decrementar product_variants.stock + products.stock (padre)
--  - Si no tiene variantId → comportamiento anterior (products.stock)
-- ============================================================

DROP FUNCTION public.checkout_reserve_stock_and_order(jsonb, uuid, text, text, numeric, jsonb);

CREATE FUNCTION public.checkout_reserve_stock_and_order(
    p_items jsonb,
    p_user_id uuid,
    p_email text,
    p_payment_intent_id text,
    p_amount_total numeric,
    p_shipping_info jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INT;
  v_current_stock INT;
  v_variant_id TEXT;
  v_unit_price NUMERIC;
BEGIN
  -- 1. Validar Stock por cada ítem
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'id')::UUID;
    v_quantity   := (v_item->>'quantity')::INT;
    v_variant_id := v_item->>'variantId';

    IF v_variant_id IS NOT NULL AND v_variant_id <> '' THEN
      -- Producto con talla/variante: validar stock de la variante específica
      SELECT stock INTO v_current_stock
        FROM product_variants
       WHERE id = v_variant_id::UUID
         FOR UPDATE;
    ELSE
      -- Producto sin variante: validar stock del producto
      SELECT stock INTO v_current_stock
        FROM products
       WHERE id = v_product_id
         FOR UPDATE;
    END IF;

    IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Stock insuficiente para ' || COALESCE(v_item->>'name', 'producto'),
        'failed_product_id', v_product_id
      );
    END IF;
  END LOOP;

  -- 2. Crear el Pedido
  INSERT INTO orders (
    user_id, email, status,
    total, subtotal, shipping_cost,
    stripe_payment_intent_id,
    shipping_name, shipping_street, shipping_city, shipping_postal_code, shipping_phone,
    created_at
  ) VALUES (
    p_user_id, p_email, 'processing',
    p_amount_total, p_amount_total, 0,
    p_payment_intent_id,
    (p_shipping_info->>'firstName') || ' ' || COALESCE(p_shipping_info->>'lastName', ''),
    p_shipping_info->>'address', p_shipping_info->>'city', p_shipping_info->>'zip', p_shipping_info->>'phone',
    NOW()
  ) RETURNING id INTO v_order_id;

  -- 3. Insertar Items y decrementar stock atómicamente
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'id')::UUID;
    v_quantity   := (v_item->>'quantity')::INT;
    v_unit_price := (v_item->>'price')::NUMERIC;
    v_variant_id := v_item->>'variantId';

    INSERT INTO order_items (
        order_id, product_id, variant_id, quantity,
        unit_price, total_price,
        product_name, product_image, size
    ) VALUES (
        v_order_id, v_product_id,
        CASE WHEN v_variant_id IS NOT NULL AND v_variant_id <> '' THEN v_variant_id::UUID ELSE NULL END,
        v_quantity,
        v_unit_price,
        (v_unit_price * v_quantity),
        COALESCE(v_item->>'name', 'Producto'),
        COALESCE(v_item->>'image', ''),
        v_item->>'size'
    );

    IF v_variant_id IS NOT NULL AND v_variant_id <> '' THEN
      -- Decrementar stock de la variante específica (talla)
      UPDATE product_variants
         SET stock = stock - v_quantity
       WHERE id = v_variant_id::UUID;

      -- Sincronizar también el stock agregado del producto padre
      UPDATE products
         SET stock = stock - v_quantity
       WHERE id = v_product_id;
    ELSE
      -- Sin variante: solo decrementar el producto
      UPDATE products
         SET stock = stock - v_quantity
       WHERE id = v_product_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Error BD: ' || SQLERRM);
END;
$$;
