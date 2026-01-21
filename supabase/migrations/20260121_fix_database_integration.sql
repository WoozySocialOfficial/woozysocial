-- =====================================================
-- Fix Database Integration Issues
-- =====================================================
-- This migration fixes:
-- 1. Missing email_notifications column in user_profiles
-- 2. Missing post_drafts table
-- 3. Creates storage buckets for media uploads
-- =====================================================

-- 1. Add email_notifications column to user_profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'email_notifications'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN email_notifications boolean DEFAULT true;

    COMMENT ON COLUMN public.user_profiles.email_notifications IS 'Whether user wants to receive email notifications';
  END IF;
END $$;

-- 2. Create post_drafts table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.post_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  caption text NULL,
  media_urls text[] NULL,
  platforms text[] NULL,
  scheduled_date timestamp with time zone NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  workspace_id uuid NULL,
  CONSTRAINT post_drafts_pkey PRIMARY KEY (id),
  CONSTRAINT post_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT post_drafts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);

-- Create indexes for post_drafts
CREATE INDEX IF NOT EXISTS post_drafts_user_id_idx ON public.post_drafts USING btree (user_id);
CREATE INDEX IF NOT EXISTS post_drafts_created_at_idx ON public.post_drafts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS post_drafts_workspace_id_idx ON public.post_drafts USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_post_drafts_workspace ON public.post_drafts USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_post_drafts_workspace_created ON public.post_drafts USING btree (workspace_id, created_at DESC);

-- Create trigger function for post_drafts updated_at
CREATE OR REPLACE FUNCTION update_post_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for post_drafts
DROP TRIGGER IF EXISTS update_post_drafts_updated_at_trigger ON post_drafts;
CREATE TRIGGER update_post_drafts_updated_at_trigger
  BEFORE UPDATE ON post_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_post_drafts_updated_at();

-- 3. Enable Row Level Security on post_drafts
ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for post_drafts
DROP POLICY IF EXISTS "Users can view their own drafts" ON public.post_drafts;
CREATE POLICY "Users can view their own drafts"
  ON public.post_drafts
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own drafts" ON public.post_drafts;
CREATE POLICY "Users can insert their own drafts"
  ON public.post_drafts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own drafts" ON public.post_drafts;
CREATE POLICY "Users can update their own drafts"
  ON public.post_drafts
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own drafts" ON public.post_drafts;
CREATE POLICY "Users can delete their own drafts"
  ON public.post_drafts
  FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Create storage buckets for media uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('post-media', 'post-media', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime']),
  ('profile-pictures', 'profile-pictures', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  ('workspace-logos', 'workspace-logos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- 5. Create storage policies for post-media bucket
DROP POLICY IF EXISTS "Anyone can view post media" ON storage.objects;
CREATE POLICY "Anyone can view post media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');

DROP POLICY IF EXISTS "Authenticated users can upload post media" ON storage.objects;
CREATE POLICY "Authenticated users can upload post media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-media'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Users can update their own post media" ON storage.objects;
CREATE POLICY "Users can update their own post media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'post-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own post media" ON storage.objects;
CREATE POLICY "Users can delete their own post media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 6. Create storage policies for profile-pictures bucket
DROP POLICY IF EXISTS "Anyone can view profile pictures" ON storage.objects;
CREATE POLICY "Anyone can view profile pictures"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-pictures');

DROP POLICY IF EXISTS "Authenticated users can upload profile pictures" ON storage.objects;
CREATE POLICY "Authenticated users can upload profile pictures"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-pictures'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Users can update their own profile picture" ON storage.objects;
CREATE POLICY "Users can update their own profile picture"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-pictures'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own profile picture" ON storage.objects;
CREATE POLICY "Users can delete their own profile picture"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-pictures'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 7. Create storage policies for workspace-logos bucket
DROP POLICY IF EXISTS "Anyone can view workspace logos" ON storage.objects;
CREATE POLICY "Anyone can view workspace logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'workspace-logos');

DROP POLICY IF EXISTS "Authenticated users can upload workspace logos" ON storage.objects;
CREATE POLICY "Authenticated users can upload workspace logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'workspace-logos'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Workspace members can update workspace logo" ON storage.objects;
CREATE POLICY "Workspace members can update workspace logo"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'workspace-logos');

DROP POLICY IF EXISTS "Workspace members can delete workspace logo" ON storage.objects;
CREATE POLICY "Workspace members can delete workspace logo"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'workspace-logos');

-- =====================================================
-- Migration Complete
-- =====================================================
