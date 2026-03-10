-- Security Fix: Remove unsafe orders INSERT RLS policy
-- Date: 2026-03-10
--
-- PROBLEM:
--   The policy "orders_insert_own" allowed any authenticated user to INSERT
--   rows directly into the orders table (WITH CHECK: user_id = auth.uid()).
--   This bypasses payment verification entirely — a user could create a fake
--   "paid" order without going through Stripe.
--
-- AFFECTED ATTACK SURFACE:
--   Any authenticated user with the Supabase anon key could call:
--     supabase.from('orders').insert({ user_id: auth.uid(), status: 'paid', ... })
--   and create fraudulent orders with arbitrary total/status values.
--
-- FIX:
--   Orders must ONLY be created by service_role via:
--     1. Stripe webhook  (src/pages/api/stripe/webhook.ts)
--     2. confirm-payment-intent endpoint
--     3. checkout_reserve_stock_and_order RPC
--
--   service_role bypasses RLS entirely (relforcerowsecurity = false),
--   so no INSERT policy is needed for the backend.
--   Authenticated and anon roles now have zero INSERT permission.

DROP POLICY IF EXISTS "orders_insert_own" ON orders;

-- Verification:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'orders';
-- Expected: only "orders_select_own" (SELECT) remains.
