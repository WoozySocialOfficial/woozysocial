-- =====================================================
-- Add Final Approval Layer
-- =====================================================
-- Date: 2026-02-20
-- Purpose: Add internal quality control layer with final approval
--          authority before client review
-- =====================================================

-- =====================================================
-- Step 1: Add can_final_approval permission column
-- =====================================================

-- Add new permission to workspace_members
ALTER TABLE public.workspace_members
ADD COLUMN IF NOT EXISTS can_final_approval BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.workspace_members.can_final_approval IS
  'Grants member final approval authority: can review posts internally and either approve immediately or forward to clients for their review';

-- Create index for efficient final approver lookups
CREATE INDEX IF NOT EXISTS idx_workspace_members_final_approval
ON public.workspace_members (workspace_id, can_final_approval)
WHERE can_final_approval = true;

-- =====================================================
-- Step 2: Extend approval_status with new values
-- =====================================================

-- Drop old constraint
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_approval_status_check;

-- Add new constraint with internal approval statuses
ALTER TABLE public.posts ADD CONSTRAINT posts_approval_status_check
CHECK (approval_status IN (
  'none',
  'pending_internal',        -- NEW: Awaiting internal review (final approver)
  'pending_client',          -- NEW: Forwarded to client by final approver
  'pending',                 -- LEGACY: Direct to client (no final approvers)
  'approved',
  'rejected',
  'changes_requested'
));

COMMENT ON COLUMN public.posts.approval_status IS
  'Approval workflow status: none, pending_internal, pending_client, pending (legacy), approved, rejected, changes_requested';

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_posts_approval_status_internal
ON public.posts (approval_status, workspace_id)
WHERE approval_status IN ('pending_internal', 'pending_client');

-- =====================================================
-- Step 3: Update post_approvals to track review stage
-- =====================================================

-- Drop old constraint
ALTER TABLE public.post_approvals DROP CONSTRAINT IF EXISTS post_approvals_status_check;

-- Add new constraint
ALTER TABLE public.post_approvals ADD CONSTRAINT post_approvals_status_check
CHECK (approval_status IN (
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'forwarded_to_client'      -- NEW: Final approver forwarded to client
));

-- Add column to track reviewer role
ALTER TABLE public.post_approvals
ADD COLUMN IF NOT EXISTS reviewed_by_role TEXT;

COMMENT ON COLUMN public.post_approvals.reviewed_by_role IS
  'Role of reviewer: final_approver, client, or owner';

-- =====================================================
-- Step 4: Update RLS Policies
-- =====================================================

-- DROP old policies that conflict
DROP POLICY IF EXISTS "Users can view posts in their workspace" ON public.posts;
DROP POLICY IF EXISTS "Final approvers can view internal review posts" ON public.posts;
DROP POLICY IF EXISTS "Clients can view forwarded posts" ON public.posts;

-- CREATE comprehensive policy for viewing posts
CREATE POLICY "Members can view posts in their workspace"
  ON public.posts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Note: Fine-grained filtering (e.g., hiding pending_internal from clients)
-- will be handled in API layer for flexibility and performance

-- =====================================================
-- Step 5: Add helper function to check for final approvers
-- =====================================================

-- Function to check if workspace has active final approvers
CREATE OR REPLACE FUNCTION public.workspace_has_final_approvers(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND can_final_approval = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_has_final_approvers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_has_final_approvers(UUID) TO service_role;

-- =====================================================
-- Verify the migration
-- =====================================================
SELECT 'Final approval layer added successfully' AS result;
