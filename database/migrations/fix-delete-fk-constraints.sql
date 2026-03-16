-- Fix FK constraints that prevent admin deletes
-- Run this once in the Supabase SQL Editor.

-- ── 1. order_items.product_id: make nullable + ON DELETE SET NULL ─────────
-- Products with existing orders cannot be deleted without this fix.
-- Making product_id nullable preserves order history (product_name snapshot exists).

ALTER TABLE public.order_items
    ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.order_items
    DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;

ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES public.products(id)
    ON DELETE SET NULL;

-- ── 2. Reload PostgREST schema cache ─────────────────────────────────────
NOTIFY pgrst, 'reload schema';
