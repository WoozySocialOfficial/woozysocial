-- =====================================================
-- Add Missing Columns to Posts Table
-- =====================================================
-- The API is trying to use columns that don't exist
-- =====================================================

-- 1. Add caption column (API uses this, but table has "content")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'caption'
  ) THEN
    ALTER TABLE public.posts
    ADD COLUMN caption text NULL;

    COMMENT ON COLUMN public.posts.caption IS 'Post caption/text - used by API (content is the old column)';
  END IF;
END $$;

-- 2. Add scheduled_at column (API uses this, but table has "scheduled_for")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'scheduled_at'
  ) THEN
    ALTER TABLE public.posts
    ADD COLUMN scheduled_at timestamp with time zone NULL;

    COMMENT ON COLUMN public.posts.scheduled_at IS 'Scheduled time - used by API (scheduled_for is the old column)';

    -- Copy existing scheduled_for data to scheduled_at
    UPDATE public.posts SET scheduled_at = scheduled_for WHERE scheduled_for IS NOT NULL;
  END IF;
END $$;

-- 3. Add posted_at column (API might use this)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'posted_at'
  ) THEN
    ALTER TABLE public.posts
    ADD COLUMN posted_at timestamp with time zone NULL;

    COMMENT ON COLUMN public.posts.posted_at IS 'Time when post was actually published';
  END IF;
END $$;

-- 4. Add last_error column (for error tracking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'last_error'
  ) THEN
    ALTER TABLE public.posts
    ADD COLUMN last_error text NULL;

    COMMENT ON COLUMN public.posts.last_error IS 'Last error message if post failed';
  END IF;
END $$;

-- 5. Update status constraint to include 'pending_approval'
DO $$
BEGIN
  -- Drop the existing constraint
  ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_status_check;

  -- Add updated constraint with pending_approval
  ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN ('draft', 'scheduled', 'published', 'failed', 'pending_approval'));
END $$;

-- 6. Add index for scheduled_at
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at
ON public.posts (scheduled_at);

-- 7. Add index for status
CREATE INDEX IF NOT EXISTS idx_posts_status
ON public.posts (status);

-- =====================================================
-- Migration Complete
-- =====================================================
-- Summary:
-- ✅ Added caption column (API expects this)
-- ✅ Added scheduled_at column (API expects this)
-- ✅ Added posted_at column
-- ✅ Added last_error column
-- ✅ Updated status constraint to include 'pending_approval'
-- ✅ Added indexes for performance
--
-- The API can now insert posts successfully!
-- =====================================================
