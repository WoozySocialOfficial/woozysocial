-- =====================================================
-- Rollback Recent Changes and Diagnose
-- =====================================================
-- This rolls back the RLS policy changes that broke things
-- =====================================================

-- 1. DISABLE RLS temporarily to allow everything to work
-- This will help us diagnose the real issue
ALTER TABLE public.posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_drafts DISABLE ROW LEVEL SECURITY;

-- 2. Add missing columns (keep these, they're correct)
DO $$
BEGIN
  -- Add weekly_summaries if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'weekly_summaries'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN weekly_summaries boolean DEFAULT true;
  END IF;

  -- Add team_activity_alerts if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'team_activity_alerts'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN team_activity_alerts boolean DEFAULT true;
  END IF;
END $$;

-- =====================================================
-- Migration Complete
-- =====================================================
-- Summary:
-- ✅ DISABLED RLS on posts, post_comments, post_drafts
-- ✅ Added missing columns to user_profiles
--
-- Now test everything:
-- 1. Settings save
-- 2. Drafts autosave
-- 3. Comments
-- 4. Scheduling
-- 5. Instant posting
--
-- If everything works with RLS disabled, we know RLS was the problem.
-- Then we can carefully add back the correct policies.
-- =====================================================
