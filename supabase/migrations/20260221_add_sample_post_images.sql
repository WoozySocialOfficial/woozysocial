-- =====================================================
-- Add sample_post_images to brand_profiles
-- =====================================================
-- Date: 2026-02-21
-- Adds an array of image URLs for sample posts so Claude
-- can visually analyse them rather than relying on text only.
-- =====================================================

-- Add column
ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS sample_post_images TEXT[] DEFAULT '{}';

-- =====================================================
-- Create Supabase Storage bucket for sample post images
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sample-posts',
  'sample-posts',
  true,
  5242880, -- 5 MB per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Storage RLS policies
-- =====================================================

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload sample post images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'sample-posts');

-- Public read (images are embedded in AI prompts via URL)
CREATE POLICY "Public can view sample post images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'sample-posts');

-- Authenticated users can delete their own uploads
CREATE POLICY "Authenticated users can delete sample post images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'sample-posts');

SELECT 'sample_post_images column and storage bucket created' AS result;
