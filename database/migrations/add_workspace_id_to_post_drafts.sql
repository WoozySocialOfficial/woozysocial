-- Migration: Add workspace_id column to post_drafts table
-- This migration adds workspace_id to existing post_drafts tables

-- Add workspace_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_drafts' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE post_drafts
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

    -- Create index on workspace_id for faster queries
    CREATE INDEX IF NOT EXISTS post_drafts_workspace_id_idx ON post_drafts(workspace_id);

    -- Update existing rows to set workspace_id from user's last_workspace_id
    UPDATE post_drafts pd
    SET workspace_id = (
      SELECT up.last_workspace_id
      FROM user_profiles up
      WHERE up.id = pd.user_id
    )
    WHERE workspace_id IS NULL;

    RAISE NOTICE 'Added workspace_id column to post_drafts table';
  ELSE
    RAISE NOTICE 'workspace_id column already exists in post_drafts table';
  END IF;
END $$;
