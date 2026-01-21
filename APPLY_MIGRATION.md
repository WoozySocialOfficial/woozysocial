# Apply Database Migration

## Quick Fix Instructions

Follow these steps to fix the database issues:

### Option 1: Via Supabase Dashboard (Recommended)

1. **Open Supabase SQL Editor**
   - Go to: https://supabase.com/dashboard/project/ispqivmpffpcsquuofmn/sql/new

2. **Copy the migration SQL**
   - Open file: `supabase/migrations/20260121_fix_database_integration.sql`
   - Copy all the contents (Ctrl+A, Ctrl+C)

3. **Run the migration**
   - Paste the SQL into the Supabase SQL Editor
   - Click "Run" button
   - Wait for success confirmation

### Option 2: Via Command Line (If you have psql installed)

```bash
cd "C:\Users\mageb\OneDrive\Desktop\woozy(13-01)\woozysocial"
node run-migration.js
```

## What This Migration Fixes

1. ✅ **Settings Save Error** - Adds `email_notifications` column to `user_profiles` table
2. ✅ **Draft Autosave** - Creates `post_drafts` table with all indexes and triggers
3. ✅ **Media Upload** - Creates storage buckets (`post-media`, `profile-pictures`, `workspace-logos`)
4. ✅ **Storage Policies** - Sets up RLS policies for secure file uploads

## After Running Migration

Once the migration is complete:

1. Refresh your browser (Ctrl+Shift+F5)
2. Try changing your timezone in Settings
3. Test draft autosave in Compose
4. Try uploading an image in a post

## Troubleshooting

If you get any errors:

1. **"relation already exists"** - This is OK, the migration uses `IF NOT EXISTS`
2. **"permission denied"** - Make sure you're logged into Supabase with the correct account
3. **Storage bucket errors** - The migration handles conflicts with `ON CONFLICT DO NOTHING`

All errors can be safely ignored if they're about existing objects.
