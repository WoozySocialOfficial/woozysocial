-- Setup Supabase Storage for post media
-- Run this SQL in your Supabase SQL Editor

-- Create the 'post-media' storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for the 'post-media' bucket

-- Policy: Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload post media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'post-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Policy: Allow public read access to all files (so Ayrshare can access them)
CREATE POLICY "Public read access for post media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'post-media');

-- Policy: Allow users to update their own files
CREATE POLICY "Users can update their own post media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'post-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'post-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Policy: Allow users to delete their own files
CREATE POLICY "Users can delete their own post media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'post-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Policy: Allow service role to manage all files (for backend operations)
CREATE POLICY "Service role can manage all post media"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'post-media')
WITH CHECK (bucket_id = 'post-media');
