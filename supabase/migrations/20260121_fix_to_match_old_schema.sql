-- =====================================================
-- Fix Database to Match Old Working Schema
-- =====================================================
-- This migration aligns the new database with the old working schema
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
  END IF;
END $$;

-- 2. Fix post_comments table to match old schema
DO $$
BEGIN
  -- Check if post_comments table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'post_comments'
  ) THEN

    -- Rename 'content' to 'comment' if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'post_comments'
      AND column_name = 'content'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'post_comments'
      AND column_name = 'comment'
    ) THEN
      ALTER TABLE public.post_comments
      RENAME COLUMN content TO comment;
    END IF;

    -- Add 'comment' column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'post_comments'
      AND column_name = 'comment'
    ) THEN
      ALTER TABLE public.post_comments
      ADD COLUMN comment text NOT NULL DEFAULT '';
    END IF;

    -- Add draft_id column if missing (for commenting on drafts)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'post_comments'
      AND column_name = 'draft_id'
    ) THEN
      ALTER TABLE public.post_comments
      ADD COLUMN draft_id uuid NULL;

      -- Add foreign key to post_drafts
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'post_drafts'
      ) THEN
        ALTER TABLE public.post_comments
        ADD CONSTRAINT post_comments_draft_id_fkey
        FOREIGN KEY (draft_id)
        REFERENCES post_drafts (id)
        ON DELETE CASCADE;

        -- Add index for draft_id
        CREATE INDEX IF NOT EXISTS idx_post_comments_draft_id
        ON public.post_comments (draft_id);
      END IF;
    END IF;

    -- Add mentions column (old name, not mentioned_users)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'post_comments'
      AND column_name = 'mentions'
    ) THEN
      ALTER TABLE public.post_comments
      ADD COLUMN mentions uuid[] DEFAULT '{}';

      -- Add GIN index for mentions
      CREATE INDEX IF NOT EXISTS idx_post_comments_mentions
      ON public.post_comments USING gin (mentions);
    END IF;

    -- Add is_system column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'post_comments'
      AND column_name = 'is_system'
    ) THEN
      ALTER TABLE public.post_comments
      ADD COLUMN is_system boolean DEFAULT false;
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
    END IF;

    -- Ensure priority check constraint exists
    DO $inner$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'post_comments_priority_check'
      ) THEN
        ALTER TABLE public.post_comments
        ADD CONSTRAINT post_comments_priority_check
        CHECK (priority IN ('normal', 'high', 'urgent'));
      END IF;
    END $inner$;

    -- Add check constraint for post_id or draft_id
    DO $inner$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_post_or_draft'
      ) THEN
        ALTER TABLE public.post_comments
        ADD CONSTRAINT check_post_or_draft
        CHECK (
          (post_id IS NOT NULL AND draft_id IS NULL) OR
          (post_id IS NULL AND draft_id IS NOT NULL)
        );
      END IF;
    END $inner$;

  END IF;
END $$;

-- 3. Ensure posts table has correct approval columns
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
  END IF;

  -- Add approval_status column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE public.posts
    ADD COLUMN approval_status text DEFAULT 'pending';
  ELSE
    -- If column exists, ensure default is 'pending' not 'none'
    ALTER TABLE public.posts
    ALTER COLUMN approval_status SET DEFAULT 'pending';
  END IF;

  -- Add created_by column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.posts
    ADD COLUMN created_by uuid NULL;

    -- Add foreign key constraint
    ALTER TABLE public.posts
    ADD CONSTRAINT posts_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users (id);
  END IF;

  -- Ensure approval_status index exists
  CREATE INDEX IF NOT EXISTS idx_posts_approval_status
  ON public.posts (approval_status);

END $$;

-- 4. Create the trigger function for setting change request priority (if missing)
CREATE OR REPLACE FUNCTION set_change_request_priority()
RETURNS TRIGGER AS $$
BEGIN
  -- If comment contains urgent keywords, set priority to urgent
  IF NEW.comment ~* '(urgent|critical|emergency|asap)' THEN
    NEW.priority := 'urgent';
  -- If comment contains high priority keywords, set priority to high
  ELSIF NEW.comment ~* '(important|high priority|needs attention)' THEN
    NEW.priority := 'high';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger for auto-setting priority (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'auto_set_change_request_priority'
    AND tgrelid = 'post_comments'::regclass
  ) THEN
    CREATE TRIGGER auto_set_change_request_priority
      BEFORE INSERT ON post_comments
      FOR EACH ROW
      EXECUTE FUNCTION set_change_request_priority();
  END IF;
END $$;

-- =====================================================
-- Migration Complete
-- =====================================================
-- Summary:
-- ✅ Added weekly_summaries and team_activity_alerts to user_profiles
-- ✅ Fixed post_comments to use 'comment' column (not 'content')
-- ✅ Added draft_id to post_comments (for draft comments)
-- ✅ Added mentions column (for @mentions)
-- ✅ Added is_system column (for system-generated comments)
-- ✅ Added priority column with auto-detection trigger
-- ✅ Added check constraint for post_id or draft_id
-- ✅ Fixed posts approval_status default to 'pending'
-- ✅ Added created_by column to posts
-- ✅ Created auto_set_change_request_priority trigger
-- =====================================================
