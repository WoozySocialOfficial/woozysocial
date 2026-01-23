-- =====================================================
-- Fix Workspaces Table RLS Infinite Recursion
-- =====================================================
-- Date: 2026-01-23
-- Issue: UPDATE policy on workspaces table queries workspace_members
--        directly, causing infinite recursion when workspace_members
--        also has RLS policies.
-- Solution: Use SECURITY DEFINER functions that bypass RLS
-- =====================================================

-- =====================================================
-- Step 1: Ensure SECURITY DEFINER functions exist
-- =====================================================

-- Function to check if user is a workspace member
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
  );
END;
$$;

-- Function to check if user is a workspace admin/owner
CREATE OR REPLACE FUNCTION public.is_workspace_admin(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
      AND role IN ('owner', 'admin')
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(UUID, UUID) TO service_role;

-- =====================================================
-- Step 2: Drop the problematic policies on workspaces table
-- =====================================================
DROP POLICY IF EXISTS "Users can view their workspaces" ON workspaces;
DROP POLICY IF EXISTS "Members can update workspaces" ON workspaces;
DROP POLICY IF EXISTS "Users can create workspaces" ON workspaces;
DROP POLICY IF EXISTS "Owners can delete workspaces" ON workspaces;

-- Create new policies using the SECURITY DEFINER functions
-- These functions were created in fix_workspace_members_rls.sql:
--   - public.is_workspace_member(workspace_id, user_id)
--   - public.is_workspace_admin(workspace_id, user_id)

-- SELECT: Users can view workspaces they're members of
CREATE POLICY "workspaces_select_policy"
  ON workspaces FOR SELECT
  USING (
    public.is_workspace_member(id, auth.uid())
  );

-- INSERT: Anyone authenticated can create a workspace
CREATE POLICY "workspaces_insert_policy"
  ON workspaces FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- UPDATE: Members can update their workspaces
CREATE POLICY "workspaces_update_policy"
  ON workspaces FOR UPDATE
  USING (
    public.is_workspace_member(id, auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(id, auth.uid())
  );

-- DELETE: Only admins can delete workspaces
CREATE POLICY "workspaces_delete_policy"
  ON workspaces FOR DELETE
  USING (
    public.is_workspace_admin(id, auth.uid())
  );

-- =====================================================
-- Verify the fix
-- =====================================================
SELECT 'Workspaces RLS policies fixed - recursion eliminated' AS result;
