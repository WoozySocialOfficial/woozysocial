-- =====================================================
-- ENHANCED COMMENTS MIGRATION
-- Adds priority system and mentions tracking
-- =====================================================

-- Add priority field (normal, high, urgent)
ALTER TABLE post_comments
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'
CHECK (priority IN ('normal', 'high', 'urgent'));

-- Add mentions array (stores user IDs of mentioned users)
ALTER TABLE post_comments
ADD COLUMN IF NOT EXISTS mentions UUID[] DEFAULT '{}';

-- Create index for priority-based sorting
CREATE INDEX IF NOT EXISTS idx_post_comments_priority
ON post_comments(post_id, priority DESC, created_at ASC);

-- Create GIN index for mentions array queries
CREATE INDEX IF NOT EXISTS idx_post_comments_mentions
ON post_comments USING GIN(mentions);

-- Update existing comments to have 'normal' priority
UPDATE post_comments SET priority = 'normal' WHERE priority IS NULL;

-- Function to auto-set urgent priority for change request comments
CREATE OR REPLACE FUNCTION set_change_request_priority()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is a system comment about a change request
  IF NEW.is_system = TRUE AND NEW.comment ILIKE '%change%request%' THEN
    NEW.priority = 'urgent';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically set priority for change requests
DROP TRIGGER IF EXISTS auto_set_change_request_priority ON post_comments;
CREATE TRIGGER auto_set_change_request_priority
  BEFORE INSERT ON post_comments
  FOR EACH ROW
  EXECUTE FUNCTION set_change_request_priority();

-- Verification query
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'post_comments'
AND column_name IN ('priority', 'mentions');

-- =====================================================
-- ROLLBACK SQL (if needed)
-- =====================================================
-- DROP TRIGGER IF EXISTS auto_set_change_request_priority ON post_comments;
-- DROP FUNCTION IF EXISTS set_change_request_priority();
-- DROP INDEX IF EXISTS idx_post_comments_priority;
-- DROP INDEX IF EXISTS idx_post_comments_mentions;
-- ALTER TABLE post_comments DROP COLUMN IF EXISTS mentions;
-- ALTER TABLE post_comments DROP COLUMN IF EXISTS priority;
