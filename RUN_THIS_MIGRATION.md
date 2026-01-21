# Fix Brand Profile - Add website_url Column

## The Problem
The `brand_profiles` table is missing the `website_url` column that the frontend is trying to save.

## The Solution
Run this migration on your Supabase database.

## Option 1: Run via Supabase Dashboard (EASIEST)

1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste this SQL:

```sql
-- Add website_url column to brand_profiles table
ALTER TABLE brand_profiles
ADD COLUMN IF NOT EXISTS website_url TEXT;

COMMENT ON COLUMN brand_profiles.website_url IS 'Brand website URL for AI context analysis';
```

5. Click "Run" or press Ctrl+Enter
6. You should see "Success. No rows returned"

## Option 2: Run via Supabase CLI

If you have Supabase CLI installed:

```bash
cd woozysocial
supabase db push
```

## Verify the Migration

After running the migration, verify it worked:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'brand_profiles';
```

You should see `website_url` in the list with type `text`.

## Then Test

1. Refresh your app at api.woozysocial.com/brand-profile
2. Fill in the brand profile form including the website URL
3. Click "Save Brand Profile"
4. It should save successfully now!
