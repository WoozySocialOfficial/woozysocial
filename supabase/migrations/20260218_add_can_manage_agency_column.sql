-- =====================================================
-- ADD can_manage_agency COLUMN TO agency_team_members
-- Allows agency owner to delegate roster + workspace
-- management to specific team members.
-- =====================================================

-- 1. Add the column
ALTER TABLE agency_team_members
  ADD COLUMN IF NOT EXISTS can_manage_agency BOOLEAN NOT NULL DEFAULT false;

-- 2. Update RLS policies to allow delegated managers to view the roster
-- Members with can_manage_agency = true can view the roster they belong to
DROP POLICY IF EXISTS "Agency managers can view team" ON agency_team_members;
CREATE POLICY "Agency managers can view team"
  ON agency_team_members FOR SELECT
  USING (
    auth.uid() = agency_owner_id
    OR (
      EXISTS (
        SELECT 1 FROM agency_team_members atm
        WHERE atm.agency_owner_id = agency_team_members.agency_owner_id
          AND atm.member_user_id = auth.uid()
          AND atm.can_manage_agency = true
          AND atm.status = 'active'
      )
    )
  );

-- Drop the old owner-only SELECT policy (replaced above)
DROP POLICY IF EXISTS "Agency owners can view own team" ON agency_team_members;

-- 3. Allow delegated managers to insert team members
DROP POLICY IF EXISTS "Agency owners can add team members" ON agency_team_members;
CREATE POLICY "Agency owners and managers can add team members"
  ON agency_team_members FOR INSERT
  WITH CHECK (
    (
      -- Owner path
      auth.uid() = agency_owner_id AND
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
          AND (subscription_tier = 'agency' OR is_whitelisted = true)
          AND (subscription_status = 'active' OR is_whitelisted = true)
      )
    )
    OR
    (
      -- Delegated manager path
      EXISTS (
        SELECT 1 FROM agency_team_members atm
        WHERE atm.agency_owner_id = agency_team_members.agency_owner_id
          AND atm.member_user_id = auth.uid()
          AND atm.can_manage_agency = true
          AND atm.status = 'active'
      )
    )
  );

-- 4. Allow delegated managers to update team members
DROP POLICY IF EXISTS "Agency owners can update team members" ON agency_team_members;
CREATE POLICY "Agency owners and managers can update team members"
  ON agency_team_members FOR UPDATE
  USING (
    auth.uid() = agency_owner_id
    OR EXISTS (
      SELECT 1 FROM agency_team_members atm
      WHERE atm.agency_owner_id = agency_team_members.agency_owner_id
        AND atm.member_user_id = auth.uid()
        AND atm.can_manage_agency = true
        AND atm.status = 'active'
    )
  );

-- 5. Allow delegated managers to delete team members
DROP POLICY IF EXISTS "Agency owners can delete team members" ON agency_team_members;
CREATE POLICY "Agency owners and managers can delete team members"
  ON agency_team_members FOR DELETE
  USING (
    auth.uid() = agency_owner_id
    OR EXISTS (
      SELECT 1 FROM agency_team_members atm
      WHERE atm.agency_owner_id = agency_team_members.agency_owner_id
        AND atm.member_user_id = auth.uid()
        AND atm.can_manage_agency = true
        AND atm.status = 'active'
    )
  );

-- 6. Allow delegated managers to view provisions
DROP POLICY IF EXISTS "Agency owners can view provisions" ON agency_workspace_provisions;
CREATE POLICY "Agency owners and managers can view provisions"
  ON agency_workspace_provisions FOR SELECT
  USING (
    auth.uid() = agency_owner_id
    OR EXISTS (
      SELECT 1 FROM agency_team_members atm
      WHERE atm.agency_owner_id = agency_workspace_provisions.agency_owner_id
        AND atm.member_user_id = auth.uid()
        AND atm.can_manage_agency = true
        AND atm.status = 'active'
    )
  );

-- 7. Allow delegated managers to create provisions
DROP POLICY IF EXISTS "Agency owners can create provisions" ON agency_workspace_provisions;
CREATE POLICY "Agency owners and managers can create provisions"
  ON agency_workspace_provisions FOR INSERT
  WITH CHECK (
    (
      auth.uid() = agency_owner_id AND
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
          AND (subscription_tier = 'agency' OR is_whitelisted = true)
          AND (subscription_status = 'active' OR is_whitelisted = true)
      )
    )
    OR
    (
      EXISTS (
        SELECT 1 FROM agency_team_members atm
        WHERE atm.agency_owner_id = agency_workspace_provisions.agency_owner_id
          AND atm.member_user_id = auth.uid()
          AND atm.can_manage_agency = true
          AND atm.status = 'active'
      )
    )
  );

-- 8. Index for efficient lookups on can_manage_agency
CREATE INDEX IF NOT EXISTS idx_agency_team_members_can_manage
  ON agency_team_members(member_user_id, can_manage_agency)
  WHERE can_manage_agency = true AND status = 'active';

-- 9. Verification
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'agency_team_members' AND column_name = 'can_manage_agency';

SELECT 'can_manage_agency column added successfully' as status;
