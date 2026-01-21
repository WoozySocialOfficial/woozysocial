# Recreate Storage Buckets in New Supabase Project

## Current Buckets (from old project)
First, let's check what buckets exist in your old Supabase project.

Go to: https://supabase.com/dashboard/project/adyeceovkhnacaxkymih/storage/buckets

---

## Common Buckets for WoozySocial

Based on typical social media app needs, you likely have:

### 1. **post-images** (or similar)
- **Purpose:** Store images for social media posts
- **Public:** Yes (posts are publicly viewable)
- **File size limit:** 50MB
- **Allowed MIME types:** image/jpeg, image/png, image/gif, image/webp

### 2. **profile-pictures** (or avatars)
- **Purpose:** User profile pictures
- **Public:** Yes
- **File size limit:** 5MB
- **Allowed MIME types:** image/jpeg, image/png, image/webp

### 3. **workspace-logos** (or brand-logos)
- **Purpose:** Workspace/brand logos
- **Public:** Yes
- **File size limit:** 5MB
- **Allowed MIME types:** image/jpeg, image/png, image/svg+xml

### 4. **post-videos** (if you have video support)
- **Purpose:** Video content for posts
- **Public:** Yes
- **File size limit:** 100MB
- **Allowed MIME types:** video/mp4, video/quicktime, video/webm

---

## How to Create Buckets in New Supabase Project

### Option 1: Via Dashboard (Recommended)
1. Go to: https://supabase.com/dashboard/project/ispqivmpffpcsquuofmn/storage/buckets
2. Click "New bucket"
3. Enter bucket name (e.g., `post-images`)
4. Toggle "Public bucket" ON (if needed)
5. Click "Create bucket"

### Option 2: Via SQL (for policies)
After creating buckets via dashboard, run these policies:

```sql
-- Policy for post-images bucket (anyone can read, authenticated users can upload)
CREATE POLICY "Public can view post images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'post-images');

CREATE POLICY "Authenticated users can upload post images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'post-images');

CREATE POLICY "Users can update their own post images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'post-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own post images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'post-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Repeat similar policies for other buckets
```

---

## SQL to Check Existing Buckets (Run in OLD Supabase)

Run this in your **OLD** Supabase project to see what buckets exist:

```sql
SELECT
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets
ORDER BY created_at;
```

Copy the results and I'll help you recreate them in the new project!

---

## SQL to Get Storage Policies (Run in OLD Supabase)

```sql
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;
```

This will show you all the storage policies you need to recreate.
