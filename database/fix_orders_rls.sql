-- ============================================================
-- FIX: Consolidated Order History RLS Policies
-- Execute this in the Supabase SQL Editor
-- ============================================================

-- 1. Orders Table: Allow users to see orders by their ID OR their email
DROP POLICY IF EXISTS orders_select_own ON orders;
DROP POLICY IF EXISTS orders_select_consolidated ON orders;

CREATE POLICY "orders_select_consolidated" ON orders
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id 
  OR 
  email ILIKE (SELECT email FROM public.users WHERE id = auth.uid())
);

-- 2. Order Items Table: Allow nested selection based on the parent order access
DROP POLICY IF EXISTS order_items_select_own ON order_items;
DROP POLICY IF EXISTS order_items_select_consolidated ON order_items;

CREATE POLICY "order_items_select_consolidated" ON order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
    AND (
      orders.user_id = auth.uid()
      OR
      orders.email ILIKE (SELECT email FROM public.users WHERE id = auth.uid())
    )
  )
);

-- 3. Verify that the 'email' column exists and is searchable
-- (If this fails, the column was likely not created in the generic schema)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='email') THEN
        ALTER TABLE orders ADD COLUMN email TEXT;
        CREATE INDEX idx_orders_email ON orders(email);
    END IF;
END $$;
