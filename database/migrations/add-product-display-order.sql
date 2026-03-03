-- ============================================================
-- Add display_order column to products table
-- Allows admin to set custom sort order from Visual Editor
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- Set initial display_order based on created_at (most recent = lowest number = first)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
  FROM products
)
UPDATE products SET display_order = ranked.rn
FROM ranked WHERE products.id = ranked.id;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS idx_products_display_order ON products(display_order);
