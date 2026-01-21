-- =====================================================
-- Fix Remaining Database Integration Issues
-- =====================================================
-- This migration fixes:
-- 1. Missing columns in user_profiles (weekly_summaries, team_activity_alerts)
-- 2. Missing post_comments table
-- 3. Missing post_approvals table (for scheduling)
-- =====================================================

-- 1. Add missing columns to user_profiles
DO $$
BEGIN
  -- Add weekly_summaries column
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

  -- Add team_activity_alerts column
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

-- 2. Create post_comments table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.post_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  content text NOT NULL,
  priority text NULL DEFAULT 'normal',
  mentioned_users uuid[] NULL,
  parent_comment_id uuid NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  deleted_at timestamp with time zone NULL,
  CONSTRAINT post_comments_pkey PRIMARY KEY (id),
  CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT post_comments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT post_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES post_comments (id) ON DELETE CASCADE,
  CONSTRAINT post_comments_priority_check CHECK (priority IN ('normal', 'high', 'urgent'))
);

-- Create indexes for post_comments
CREATE INDEX IF NOT EXISTS post_comments_post_id_idx ON public.post_comments USING btree (post_id);
CREATE INDEX IF NOT EXISTS post_comments_user_id_idx ON public.post_comments USING btree (user_id);
CREATE INDEX IF NOT EXISTS post_comments_workspace_id_idx ON public.post_comments USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS post_comments_created_at_idx ON public.post_comments USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS post_comments_parent_comment_id_idx ON public.post_comments USING btree (parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- Create trigger function for post_comments updated_at
CREATE OR REPLACE FUNCTION update_post_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for post_comments
DROP TRIGGER IF EXISTS update_post_comments_updated_at_trigger ON post_comments;
CREATE TRIGGER update_post_comments_updated_at_trigger
  BEFORE UPDATE ON post_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_post_comments_updated_at();

-- Enable Row Level Security on post_comments
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for post_comments
DROP POLICY IF EXISTS "Users can view comments in their workspace" ON public.post_comments;
CREATE POLICY "Users can view comments in their workspace"
  ON public.post_comments
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert comments in their workspace" ON public.post_comments;
CREATE POLICY "Users can insert comments in their workspace"
  ON public.post_comments
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can update their own comments" ON public.post_comments;
CREATE POLICY "Users can update their own comments"
  ON public.post_comments
  FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.post_comments;
CREATE POLICY "Users can delete their own comments"
  ON public.post_comments
  FOR DELETE
  USING (user_id = auth.uid());

-- 3. Create post_approvals table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.post_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  approver_id uuid NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamp with time zone NULL DEFAULT now(),
  responded_at timestamp with time zone NULL,
  comments text NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT post_approvals_pkey PRIMARY KEY (id),
  CONSTRAINT post_approvals_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_approvals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT post_approvals_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT post_approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT post_approvals_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

-- Create indexes for post_approvals
CREATE INDEX IF NOT EXISTS post_approvals_post_id_idx ON public.post_approvals USING btree (post_id);
CREATE INDEX IF NOT EXISTS post_approvals_workspace_id_idx ON public.post_approvals USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS post_approvals_status_idx ON public.post_approvals USING btree (status);
CREATE INDEX IF NOT EXISTS post_approvals_requested_by_idx ON public.post_approvals USING btree (requested_by);
CREATE INDEX IF NOT EXISTS post_approvals_approver_id_idx ON public.post_approvals USING btree (approver_id) WHERE approver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS post_approvals_requested_at_idx ON public.post_approvals USING btree (requested_at DESC);

-- Create trigger function for post_approvals updated_at
CREATE OR REPLACE FUNCTION update_post_approvals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for post_approvals
DROP TRIGGER IF EXISTS update_post_approvals_updated_at_trigger ON post_approvals;
CREATE TRIGGER update_post_approvals_updated_at_trigger
  BEFORE UPDATE ON post_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_post_approvals_updated_at();

-- Enable Row Level Security on post_approvals
ALTER TABLE public.post_approvals ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for post_approvals
DROP POLICY IF EXISTS "Users can view approvals in their workspace" ON public.post_approvals;
CREATE POLICY "Users can view approvals in their workspace"
  ON public.post_approvals
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create approval requests" ON public.post_approvals;
CREATE POLICY "Users can create approval requests"
  ON public.post_approvals
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
    AND requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "Approvers can update approvals" ON public.post_approvals;
CREATE POLICY "Approvers can update approvals"
  ON public.post_approvals
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
    OR requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can delete their approval requests" ON public.post_approvals;
CREATE POLICY "Users can delete their approval requests"
  ON public.post_approvals
  FOR DELETE
  USING (requested_by = auth.uid());

-- 4. Ensure posts table has approval-related columns
DO $$
BEGIN
  -- Add requires_approval column
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

  -- Add approval_status column
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
