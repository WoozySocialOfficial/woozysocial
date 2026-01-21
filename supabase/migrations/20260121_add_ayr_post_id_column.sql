-- =====================================================
-- Add ayr_post_id Column (API expects this)
-- =====================================================

DO $$
BEGIN
  -- Add ayr_post_id column (API uses this, but table has "ayrshare_post_id")
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'posts'
    AND column_name = 'ayr_post_id'
  ) THEN
    ALTER TABLE public.posts
    ADD COLUMN ayr_post_id text NULL;

    COMMENT ON COLUMN public.posts.ayr_post_id IS 'Ayrshare post ID - used by API (ayrshare_post_id is the old column)';

    -- Copy existing ayrshare_post_id data to ayr_post_id
    UPDATE public.posts
    SET ayr_post_id = ayrshare_post_id
    WHERE ayrshare_post_id IS NOT NULL;
  END IF;
END $$;

-- Create index for ayr_post_id
CREATE INDEX IF NOT EXISTS idx_posts_ayr_post_id
ON public.posts (ayr_post_id);

-- =====================================================
-- Migration Complete
-- =====================================================
-- Summary:
-- ✅ Added ayr_post_id column
-- ✅ Copied data from ayrshare_post_id
-- ✅ Added index for performance
--
-- Schedule page should now show posts!
-- =====================================================
