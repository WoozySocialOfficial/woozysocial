-- Add website_url column to brand_profiles table
ALTER TABLE brand_profiles
ADD COLUMN IF NOT EXISTS website_url TEXT;

COMMENT ON COLUMN brand_profiles.website_url IS 'Brand website URL for AI context analysis';
