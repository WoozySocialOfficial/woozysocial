-- =====================================================
-- Fix Agency Team Members RLS Infinite Recursion
-- =====================================================
-- Date: 2026-02-19
-- Issue: UPDATE/SELECT policies on agency_team_members table query
--        agency_team_members itself, causing infinite recursion
-- Solution: Use SECURITY DEFINER functions that bypass RLS
-- =====================================================

-- =====================================================
-- Step 1: Create SECURITY DEFINER functions
-- =====================================================

-- Function to check if user is the agency owner
CREATE OR REPLACE FUNCTION public.is_agency_owner(p_agency_owner_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN p_agency_owner_id = p_user_id;
END;
$$;

-- Function to check if user can manage the agency
CREATE OR REPLACE FUNCTION public.can_manage_agency(p_agency_owner_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return true if user is the owner OR has can_manage_agency permission
  RETURN p_agency_owner_id = p_user_id OR EXISTS (
    SELECT 1 FROM agency_team_members
    WHERE agency_owner_id = p_agency_owner_id
      AND member_user_id = p_user_id
      AND can_manage_agency = true
      AND status = 'active'
  );
END;
$$;

-- Function to check if user has active agency subscription
CREATE OR REPLACE FUNCTION public.has_agency_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = p_user_id
      AND (subscription_tier = 'agency' OR is_whitelisted = true)
      AND (subscription_status = 'active' OR is_whitelisted = true)
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_agency_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_agency(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_agency_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agency_owner(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_agency(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_agency_subscription(UUID) TO service_role;

-- =====================================================
-- Step 2: Drop the problematic policies
-- =====================================================
DROP POLICY IF EXISTS "Agency managers can view team" ON agency_team_members;
DROP POLICY IF EXISTS "Agency owners can view own team" ON agency_team_members;
DROP POLICY IF EXISTS "Agency owners and managers can add team members" ON agency_team_members;
DROP POLICY IF EXISTS "Agency owners and managers can update team members" ON agency_team_members;
DROP POLICY IF EXISTS "Agency owners and managers can delete team members" ON agency_team_members;

-- =====================================================
-- Step 3: Create new policies using SECURITY DEFINER functions
-- =====================================================

-- SELECT: Agency owners and managers can view team
CREATE POLICY "agency_team_members_select_policy"
  ON agency_team_members FOR SELECT
  USING (
    public.can_manage_agency(agency_owner_id, auth.uid())
  );

-- INSERT: Agency owners and managers with active subscription can add team members
CREATE POLICY "agency_team_members_insert_policy"
  ON agency_team_members FOR INSERT
  WITH CHECK (
    -- Owner with subscription
    (
      public.is_agency_owner(agency_owner_id, auth.uid())
      AND public.has_agency_subscription(auth.uid())
    )
    OR
    -- Delegated manager
    public.can_manage_agency(agency_owner_id, auth.uid())
  );

-- UPDATE: Agency owners and managers can update team members
CREATE POLICY "agency_team_members_update_policy"
  ON agency_team_members FOR UPDATE
  USING (
    public.can_manage_agency(agency_owner_id, auth.uid())
  )
  WITH CHECK (
    public.can_manage_agency(agency_owner_id, auth.uid())
  );

-- DELETE: Agency owners and managers can delete team members
CREATE POLICY "agency_team_members_delete_policy"
  ON agency_team_members FOR DELETE
  USING (
    public.can_manage_agency(agency_owner_id, auth.uid())
  );

-- =====================================================
-- Step 4: Fix agency_workspace_provisions policies
-- =====================================================

DROP POLICY IF EXISTS "Agency owners and managers can view provisions" ON agency_workspace_provisions;
DROP POLICY IF EXISTS "Agency owners and managers can create provisions" ON agency_workspace_provisions;

-- SELECT: Agency owners and managers can view provisions
CREATE POLICY "agency_provisions_select_policy"
  ON agency_workspace_provisions FOR SELECT
  USING (
    public.can_manage_agency(agency_owner_id, auth.uid())
  );

-- INSERT: Agency owners and managers with subscription can create provisions
CREATE POLICY "agency_provisions_insert_policy"
  ON agency_workspace_provisions FOR INSERT
  WITH CHECK (
    -- Owner with subscription
    (
      public.is_agency_owner(agency_owner_id, auth.uid())
      AND public.has_agency_subscription(auth.uid())
    )
    OR
    -- Delegated manager
    public.can_manage_agency(agency_owner_id, auth.uid())
  );

-- =====================================================
-- Verify the fix
-- =====================================================
SELECT 'Agency team members RLS policies fixed - recursion eliminated' AS result;
