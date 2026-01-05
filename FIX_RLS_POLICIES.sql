-- Run this in Supabase SQL Editor to fix RLS policies
-- This ensures the frontend can read team_invitations

-- First, let's check what data exists
-- Run this first to see if there's any data:
SELECT
  id,
  owner_id,
  email,
  role,
  status,
  invited_at,
  expires_at
FROM team_invitations
ORDER BY invited_at DESC
LIMIT 10;

-- If you see data above, the table exists and has invitations.
-- Now let's check the RLS policies:

SELECT * FROM pg_policies
WHERE tablename = 'team_invitations';

-- If you see policies, great! If not, or if they're wrong, run the code below:

-- ============================================
-- FIX: Enable RLS and Create Proper Policies
-- ============================================

-- Enable RLS if not already enabled
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Users can view their own sent invitations" ON team_invitations;
DROP POLICY IF EXISTS "Users can view invitations sent to them" ON team_invitations;
DROP POLICY IF EXISTS "Users can insert their own invitations" ON team_invitations;
DROP POLICY IF EXISTS "Users can update their own invitations" ON team_invitations;
DROP POLICY IF EXISTS "Service role bypass RLS" ON team_invitations;

-- Policy 1: Allow users to view invitations they sent
CREATE POLICY "Users can view their own sent invitations"
ON team_invitations
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- Policy 2: Allow users to view invitations sent to their email
CREATE POLICY "Users can view invitations sent to them"
ON team_invitations
FOR SELECT
TO authenticated
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Policy 3: Allow authenticated users to insert invitations
CREATE POLICY "Users can insert their own invitations"
ON team_invitations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Policy 4: Allow users to update their own invitations
CREATE POLICY "Users can update their own invitations"
ON team_invitations
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id);

-- Policy 5: Allow service role to bypass RLS (for server.js)
CREATE POLICY "Service role bypass RLS"
ON team_invitations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- Test the policies
-- ============================================

-- Check policies are created
SELECT policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'team_invitations';

-- Test: Try to select as current user (this simulates what the frontend does)
-- You should see your invitations
SELECT * FROM team_invitations
WHERE owner_id = auth.uid()
AND status = 'pending';
