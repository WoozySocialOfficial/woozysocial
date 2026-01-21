-- =====================================================
-- Add Missing Columns Only (No New Tables)
-- =====================================================
-- This migration only adds missing columns to existing tables
-- =====================================================

-- 1. Add missing columns to user_profiles
DO $$
BEGIN
  -- Add weekly_summaries column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'weekly_summaries'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN weekly_summaries boolean DEFAULT true;

    COMMENT ON COLUMN public.user_profiles.weekly_summaries IS 'Whether user wants to receive weekly summary emails';
  END IF;

  -- Add team_activity_alerts column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'team_activity_alerts'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN team_activity_alerts boolean DEFAULT true;

    COMMENT ON COLUMN public.user_profiles.team_activity_alerts IS 'Whether user wants to receive team activity alert emails';
  END IF;
END $$;

-- 2. Add missing columns to post_comments (if table exists)
DO $$
BEGIN
  -- Check if post_comments table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'post_comments'
  ) THEN

    -- Add parent_comment_id column if missing (for nested replies)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'post_comments'
      AND column_name = 'parent_comment_id'
    ) THEN
      ALTER TABLE public.post_comments
      ADD COLUMN parent_comment_id uuid NULL;

      -- Add foreign key constraint
      ALTER TABLE public.post_comments
      ADD CONSTRAINT post_comments_parent_comment_id_fkey
      FOREIGN KEY (parent_comment_id)
      REFERENCES post_comments (id)
      ON DELETE CASCADE;

      -- Add index for parent_comment_id
      CREATE INDEX post_comments_parent_comment_id_idx
      ON public.post_comments
      USING btree (parent_comment_id)
      WHERE parent_comment_id IS NOT NULL;

      COMMENT ON COLUMN public.post_comments.parent_comment_id IS 'Parent comment ID for nested replies';
    END IF;

    -- Add priority column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'post_comments'
      AND column_name = 'priority'
    ) THEN
      ALTER TABLE public.post_comments
      ADD COLUMN priority text DEFAULT 'normal';

      -- Add check constraint
      ALTER TABLE public.post_comments
      ADD CONSTRAINT post_comments_priority_check
      CHECK (priority IN ('normal', 'high', 'urgent'));

      COMMENT ON COLUMN public.post_comments.priority IS 'Comment priority level';
    END IF;

    -- Add mentioned_users column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'post_comments'
      AND column_name = 'mentioned_users'
    ) THEN
      ALTER TABLE public.post_comments
      ADD COLUMN mentioned_users uuid[] NULL;

      COMMENT ON COLUMN public.post_comments.mentioned_users IS 'Array of user IDs mentioned in the comment';
    END IF;

  END IF;
END $$;

-- 3. Add missing columns to posts table (for approval workflow)
DO $$
BEGIN
  -- Add requires_approval column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'requires_approval'
  ) THEN
    ALTER TABLE public.posts
    ADD COLUMN requires_approval boolean DEFAULT false;

    COMMENT ON COLUMN public.posts.requires_approval IS 'Whether this post requires approval before publishing';
  END IF;

  -- Add approval_status column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE public.posts
    ADD COLUMN approval_status text DEFAULT 'none';

    COMMENT ON COLUMN public.posts.approval_status IS 'Approval status: none, pending, approved, rejected';

    -- Add check constraint
    ALTER TABLE public.posts
    ADD CONSTRAINT posts_approval_status_check
    CHECK (approval_status IN ('none', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

-- =====================================================
-- Migration Complete
-- =====================================================
-- Summary:
-- ✅ Added weekly_summaries to user_profiles
-- ✅ Added team_activity_alerts to user_profiles
-- ✅ Added parent_comment_id to post_comments (for nested replies)
-- ✅ Added priority to post_comments
-- ✅ Added mentioned_users to post_comments
-- ✅ Added requires_approval to posts
-- ✅ Added approval_status to posts
-- =====================================================
