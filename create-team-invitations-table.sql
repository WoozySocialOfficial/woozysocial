-- Create team_invitations table if it doesn't exist
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/[your-project]/editor

-- First, check if the table exists
-- If you see an error that the table already exists, that's fine - skip to checking the data

CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  status TEXT DEFAULT 'pending',
  invite_token UUID DEFAULT gen_random_uuid(),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  CONSTRAINT valid_role CHECK (role IN ('admin', 'editor', 'view_only')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired'))
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_team_invitations_owner_id ON team_invitations(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(invite_token);

-- Enable Row Level Security
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own sent invitations" ON team_invitations;
DROP POLICY IF EXISTS "Users can view invitations sent to them" ON team_invitations;
DROP POLICY IF EXISTS "Users can insert their own invitations" ON team_invitations;
DROP POLICY IF EXISTS "Users can update their own invitations" ON team_invitations;

-- RLS Policies
-- Allow users to view invitations they sent
CREATE POLICY "Users can view their own sent invitations"
ON team_invitations
FOR SELECT
USING (auth.uid() = owner_id);

-- Allow users to view invitations sent to their email
CREATE POLICY "Users can view invitations sent to them"
ON team_invitations
FOR SELECT
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Allow authenticated users to insert invitations
CREATE POLICY "Users can insert their own invitations"
ON team_invitations
FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- Allow users to update their own invitations (for cancel/resend)
CREATE POLICY "Users can update their own invitations"
ON team_invitations
FOR UPDATE
USING (auth.uid() = owner_id);

-- Check existing data (run this after creating the table)
-- SELECT * FROM team_invitations ORDER BY invited_at DESC;
