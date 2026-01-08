-- =====================================================
-- VERIFY AND FIX SCHEMA FOR PRODUCTION
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add missing columns to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;

-- 2. Create post_approvals table if not exists
CREATE TABLE IF NOT EXISTS post_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id)
);

-- 3. Create/update post_comments table
-- First check if it exists with old structure
DO $$
BEGIN
  -- Add workspace_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_comments' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE post_comments ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;

  -- Add is_system if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_comments' AND column_name = 'is_system'
  ) THEN
    ALTER TABLE post_comments ADD COLUMN is_system BOOLEAN DEFAULT FALSE;
  END IF;

  -- Rename content to comment if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_comments' AND column_name = 'content'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_comments' AND column_name = 'comment'
  ) THEN
    ALTER TABLE post_comments RENAME COLUMN content TO comment;
  END IF;

  -- Add comment column if neither exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_comments' AND column_name = 'comment'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_comments' AND column_name = 'content'
  ) THEN
    ALTER TABLE post_comments ADD COLUMN comment TEXT;
  END IF;
END
$$;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_workspace ON posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_posts_approval_status ON posts(approval_status);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_post_approvals_post ON post_approvals(post_id);
CREATE INDEX IF NOT EXISTS idx_post_approvals_workspace ON post_approvals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);

-- 5. Enable RLS on new tables
ALTER TABLE post_approvals ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for post_approvals (if not exists)
DO $$
BEGIN
  -- Drop existing policies to recreate
  DROP POLICY IF EXISTS "Members can view post approvals" ON post_approvals;
  DROP POLICY IF EXISTS "Members can manage approvals" ON post_approvals;
END
$$;

-- Workspace members can view approvals
CREATE POLICY "Members can view post approvals"
  ON post_approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = post_approvals.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- Workspace members can manage approvals
CREATE POLICY "Members can manage approvals"
  ON post_approvals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = post_approvals.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- 7. Verify the schema
SELECT
  'posts' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'posts'
  AND column_name IN ('workspace_id', 'approval_status', 'requires_approval', 'caption', 'scheduled_at', 'status', 'ayr_post_id', 'last_error')
ORDER BY column_name;

-- 8. Check post_approvals exists
SELECT
  'post_approvals' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'post_approvals'
ORDER BY column_name;

-- 9. Check post_comments has required columns
SELECT
  'post_comments' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'post_comments'
ORDER BY column_name;
