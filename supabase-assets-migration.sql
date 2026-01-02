-- Create media_assets table
CREATE TABLE IF NOT EXISTS public.media_assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_media_assets_user_id ON public.media_assets(user_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON public.media_assets(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view only their own assets
CREATE POLICY "Users can view their own media assets"
    ON public.media_assets
    FOR SELECT
    USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own assets
CREATE POLICY "Users can insert their own media assets"
    ON public.media_assets
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to delete their own assets
CREATE POLICY "Users can delete their own media assets"
    ON public.media_assets
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create policy to allow users to update their own assets
CREATE POLICY "Users can update their own media assets"
    ON public.media_assets
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create storage bucket for media assets (run this in Supabase Dashboard -> Storage)
-- 1. Go to Storage in Supabase Dashboard
-- 2. Click "Create a new bucket"
-- 3. Name: media-assets
-- 4. Public bucket: YES (so assets can be accessed via public URL)
-- 5. File size limit: 52428800 (50MB)
-- 6. Allowed MIME types: image/*, video/*

-- Storage policies (run these after creating the bucket)
-- These allow authenticated users to upload, update, and delete their own files

-- Policy: Users can upload files to their own folder
CREATE POLICY "Users can upload media to their own folder"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'media-assets' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: Users can update files in their own folder
CREATE POLICY "Users can update their own media"
    ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'media-assets' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: Users can delete files in their own folder
CREATE POLICY "Users can delete their own media"
    ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'media-assets' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: Anyone can view files (since bucket is public)
CREATE POLICY "Public can view media"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'media-assets');
