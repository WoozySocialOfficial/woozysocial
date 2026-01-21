-- =====================================================
-- Fix RLS Policies for Posts and Comments
-- =====================================================
-- This migration fixes Row Level Security policies that are blocking
-- post creation and comment creation
-- =====================================================

-- 1. Drop existing restrictive policies on posts table
DROP POLICY IF EXISTS "Users can view posts in their workspace" ON public.posts;
DROP POLICY IF EXISTS "Users can insert posts in their workspace" ON public.posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON public.posts;

-- 2. Create proper RLS policies for posts table
-- Allow users to view posts in workspaces they're members of
CREATE POLICY "Users can view posts in their workspace"
  ON public.posts
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Allow users to insert posts in workspaces they're members of
CREATE POLICY "Users can insert posts in their workspace"
  ON public.posts
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
    AND (user_id = auth.uid() OR created_by = auth.uid())
  );

-- Allow users to update their own posts
CREATE POLICY "Users can update their own posts"
  ON public.posts
  FOR UPDATE
  USING (
    user_id = auth.uid() OR created_by = auth.uid()
  );

-- Allow users to delete their own posts
CREATE POLICY "Users can delete their own posts"
  ON public.posts
  FOR DELETE
  USING (
    user_id = auth.uid() OR created_by = auth.uid()
  );

-- 3. Drop existing restrictive policies on post_comments table
DROP POLICY IF EXISTS "Users can view comments in their workspace" ON public.post_comments;
DROP POLICY IF EXISTS "Users can insert comments in their workspace" ON public.post_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.post_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.post_comments;

-- 4. Create proper RLS policies for post_comments table
-- Allow users to view comments in workspaces they're members of
CREATE POLICY "Users can view comments in their workspace"
  ON public.post_comments
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Allow users to insert comments in workspaces they're members of
CREATE POLICY "Users can insert comments in their workspace"
  ON public.post_comments
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- Allow users to update their own comments
CREATE POLICY "Users can update their own comments"
  ON public.post_comments
  FOR UPDATE
  USING (user_id = auth.uid());

-- Allow users to delete their own comments
CREATE POLICY "Users can delete their own comments"
  ON public.post_comments
  FOR DELETE
  USING (user_id = auth.uid());

-- 5. Drop existing restrictive policies on post_drafts table
DROP POLICY IF EXISTS "Users can view their own drafts" ON public.post_drafts;
DROP POLICY IF EXISTS "Users can insert their own drafts" ON public.post_drafts;
DROP POLICY IF EXISTS "Users can update their own drafts" ON public.post_drafts;
DROP POLICY IF EXISTS "Users can delete their own drafts" ON public.post_drafts;

-- 6. Create proper RLS policies for post_drafts table
-- Allow users to view their own drafts
CREATE POLICY "Users can view their own drafts"
  ON public.post_drafts
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Allow users to insert their own drafts
CREATE POLICY "Users can insert their own drafts"
  ON public.post_drafts
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Allow users to update their own drafts
CREATE POLICY "Users can update their own drafts"
  ON public.post_drafts
  FOR UPDATE
  USING (user_id = auth.uid());

-- Allow users to delete their own drafts
CREATE POLICY "Users can delete their own drafts"
  ON public.post_drafts
  FOR DELETE
  USING (user_id = auth.uid());

-- 7. Ensure RLS is enabled on all tables
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Migration Complete
-- =====================================================
-- Summary:
-- ✅ Recreated RLS policies for posts table
-- ✅ Recreated RLS policies for post_comments table
-- ✅ Recreated RLS policies for post_drafts table
-- ✅ Policies allow workspace members to create posts/comments
-- ✅ Policies allow users to manage their own content
-- =====================================================
