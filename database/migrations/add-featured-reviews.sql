-- Add is_featured column to reviews table
-- Allows admins to mark up to 3 reviews as featured for the homepage testimonials section

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- Index for fast homepage query
CREATE INDEX IF NOT EXISTS idx_reviews_featured ON reviews(is_featured) WHERE is_featured = true;
