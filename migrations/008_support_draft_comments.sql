-- =====================================================
-- SUPPORT COMMENTS ON DRAFTS
-- Allows post_comments to reference either posts or post_drafts
-- =====================================================

-- Add optional draft_id column to post_comments
ALTER TABLE post_comments
ADD COLUMN IF NOT EXISTS draft_id UUID REFERENCES post_drafts(id) ON DELETE CASCADE;

-- Create index for draft comments
CREATE INDEX IF NOT EXISTS idx_post_comments_draft_id
ON post_comments(draft_id);

-- Update the constraint so that EITHER post_id OR draft_id must be set (but not both)
-- First, we need to make post_id nullable (temporarily)
ALTER TABLE post_comments
ALTER COLUMN post_id DROP NOT NULL;

-- Add a check constraint to ensure either post_id or draft_id is set
ALTER TABLE post_comments
ADD CONSTRAINT check_post_or_draft
CHECK (
  (post_id IS NOT NULL AND draft_id IS NULL) OR
  (post_id IS NULL AND draft_id IS NOT NULL)
);

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'post_comments'
AND column_name IN ('post_id', 'draft_id');

-- =====================================================
-- ROLLBACK SQL (if needed)
-- =====================================================
-- ALTER TABLE post_comments DROP CONSTRAINT IF EXISTS check_post_or_draft;
-- ALTER TABLE post_comments ALTER COLUMN post_id SET NOT NULL;
-- DROP INDEX IF EXISTS idx_post_comments_draft_id;
-- ALTER TABLE post_comments DROP COLUMN IF EXISTS draft_id;
