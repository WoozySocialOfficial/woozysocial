-- Add post_settings column to posts table for Phase 4
-- This stores advanced posting options like shortenLinks, threadPost, instagramType

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS post_settings JSONB DEFAULT '{}'::jsonb;

-- Add index for faster queries on post settings
CREATE INDEX IF NOT EXISTS idx_posts_settings ON posts USING gin(post_settings);

-- Add comment for documentation
COMMENT ON COLUMN posts.post_settings IS 'Advanced posting options from Phase 4: shortenLinks, threadPost, threadNumber, instagramType';
