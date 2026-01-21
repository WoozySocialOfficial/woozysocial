-- Workspace Schema Migration
-- This migration creates the workspace system with full data isolation

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CREATE NEW TABLES
-- =====================================================

-- Workspaces table - represents different companies/clients
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  timezone TEXT DEFAULT 'America/New_York',

  -- Ayrshare integration (moved from user_profiles)
  ayr_profile_key TEXT UNIQUE,
  ayr_ref_id TEXT UNIQUE,

  -- Settings
  notification_preferences JSONB DEFAULT '{}',
  custom_settings JSONB DEFAULT '{}',

  -- Subscription/Plan (for future billing)
  plan_type TEXT DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  max_team_members INTEGER DEFAULT 1,
  max_posts_per_month INTEGER DEFAULT 50,
  max_social_accounts INTEGER DEFAULT 3,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL, -- Soft delete

  -- Constraints
  CHECK (plan_type IN ('free', 'pro', 'enterprise'))
);

-- Workspace members table (replaces team_members)
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role and permissions
  role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'editor', 'member'
  can_manage_team BOOLEAN DEFAULT false,
  can_manage_settings BOOLEAN DEFAULT false,
  can_delete_posts BOOLEAN DEFAULT true,

  -- Invitation tracking
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(workspace_id, user_id),
  CHECK (role IN ('owner', 'admin', 'editor', 'member'))
);

-- Workspace invitations table
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invitation_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(workspace_id, email),
  CHECK (role IN ('admin', 'editor', 'member'))
);

-- =====================================================
-- 2. MODIFY EXISTING TABLES (ADD WORKSPACE_ID)
-- =====================================================

-- Add workspace_id to user_profiles (for last active workspace preference)
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS last_workspace_id UUID REFERENCES workspaces(id);

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS workspace_preferences JSONB DEFAULT '{}';

-- Add workspace_id to posts
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Add workspace_id to connected_accounts
ALTER TABLE connected_accounts
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Add workspace_id to post_drafts (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'post_drafts') THEN
    ALTER TABLE post_drafts
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Add workspace_id to media_assets (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'media_assets') THEN
    ALTER TABLE media_assets
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Create brand_profiles table if it doesn't exist (workspace-specific brand settings)
CREATE TABLE IF NOT EXISTS brand_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID UNIQUE NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_name TEXT,
  website_url TEXT,
  brand_description TEXT,
  tone_of_voice TEXT DEFAULT 'Professional',
  target_audience TEXT,
  key_topics TEXT,
  brand_values TEXT,
  sample_posts TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_role ON workspace_members(workspace_id, role);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON workspace_invitations(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token ON workspace_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace ON workspace_invitations(workspace_id);

CREATE INDEX IF NOT EXISTS idx_posts_workspace ON posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_workspace ON connected_accounts(workspace_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_last_workspace ON user_profiles(last_workspace_id);

-- Create indexes for post_drafts and media_assets if tables exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'post_drafts') THEN
    CREATE INDEX IF NOT EXISTS idx_post_drafts_workspace ON post_drafts(workspace_id);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'media_assets') THEN
    CREATE INDEX IF NOT EXISTS idx_media_assets_workspace ON media_assets(workspace_id);
  END IF;
END
$$;

-- =====================================================
-- 4. CREATE UPDATED_AT TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for workspaces table
DROP TRIGGER IF EXISTS update_workspaces_updated_at ON workspaces;
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for brand_profiles table
DROP TRIGGER IF EXISTS update_brand_profiles_updated_at ON brand_profiles;
CREATE TRIGGER update_brand_profiles_updated_at
  BEFORE UPDATE ON brand_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on workspaces table
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Users can view workspaces they're members of
DROP POLICY IF EXISTS "Users can view their workspaces" ON workspaces;
CREATE POLICY "Users can view their workspaces"
  ON workspaces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- Users can insert workspaces (they become the owner)
DROP POLICY IF EXISTS "Users can create workspaces" ON workspaces;
CREATE POLICY "Users can create workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Only owners can update workspace
DROP POLICY IF EXISTS "Owners can update workspace" ON workspaces;
CREATE POLICY "Owners can update workspace"
  ON workspaces FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'owner'
    )
  );

-- Only owners can delete workspace
DROP POLICY IF EXISTS "Owners can delete workspace" ON workspaces;
CREATE POLICY "Owners can delete workspace"
  ON workspaces FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'owner'
    )
  );

-- Enable RLS on workspace_members table
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Users can view members of their workspaces
DROP POLICY IF EXISTS "Users can view workspace members" ON workspace_members;
CREATE POLICY "Users can view workspace members"
  ON workspace_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Owners and admins can add members
DROP POLICY IF EXISTS "Admins can add members" ON workspace_members;
CREATE POLICY "Admins can add members"
  ON workspace_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
        AND wm.can_manage_team = true
    )
  );

-- Owners and admins can update members
DROP POLICY IF EXISTS "Admins can update members" ON workspace_members;
CREATE POLICY "Admins can update members"
  ON workspace_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
        AND wm.can_manage_team = true
    )
  );

-- Owners and admins can remove members
DROP POLICY IF EXISTS "Admins can remove members" ON workspace_members;
CREATE POLICY "Admins can remove members"
  ON workspace_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
        AND wm.can_manage_team = true
    )
  );

-- Enable RLS on workspace_invitations table
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Users can view invitations for their workspaces
DROP POLICY IF EXISTS "Members can view invitations" ON workspace_invitations;
CREATE POLICY "Members can view invitations"
  ON workspace_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspace_invitations.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- Admins can create invitations
DROP POLICY IF EXISTS "Admins can create invitations" ON workspace_invitations;
CREATE POLICY "Admins can create invitations"
  ON workspace_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspace_invitations.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role IN ('owner', 'admin')
        AND workspace_members.can_manage_team = true
    )
  );

-- Enable RLS on brand_profiles table
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view brand profiles for their workspaces
DROP POLICY IF EXISTS "Members can view brand profiles" ON brand_profiles;
CREATE POLICY "Members can view brand profiles"
  ON brand_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = brand_profiles.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- All members can insert/update brand profiles
DROP POLICY IF EXISTS "Members can manage brand profiles" ON brand_profiles;
CREATE POLICY "Members can manage brand profiles"
  ON brand_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = brand_profiles.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- =====================================================
-- 6. UPDATE EXISTING RLS POLICIES FOR WORKSPACE ISOLATION
-- =====================================================

-- Update posts policies to use workspace_id
DROP POLICY IF EXISTS "Users can view their own posts" ON posts;
DROP POLICY IF EXISTS "Users can view posts in their workspaces" ON posts;
CREATE POLICY "Users can view posts in their workspaces"
  ON posts FOR SELECT
  USING (
    workspace_id IS NULL AND user_id = auth.uid() -- Backwards compatibility during migration
    OR
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = posts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own posts" ON posts;
DROP POLICY IF EXISTS "Users can insert posts in their workspaces" ON posts;
CREATE POLICY "Users can insert posts in their workspaces"
  ON posts FOR INSERT
  WITH CHECK (
    workspace_id IS NULL AND user_id = auth.uid() -- Backwards compatibility during migration
    OR
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = posts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own posts" ON posts;
DROP POLICY IF EXISTS "Users can update posts in their workspaces" ON posts;
CREATE POLICY "Users can update posts in their workspaces"
  ON posts FOR UPDATE
  USING (
    workspace_id IS NULL AND user_id = auth.uid() -- Backwards compatibility during migration
    OR
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = posts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete posts in their workspaces" ON posts;
CREATE POLICY "Users can delete posts in their workspaces"
  ON posts FOR DELETE
  USING (
    workspace_id IS NULL AND user_id = auth.uid() -- Backwards compatibility during migration
    OR
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = posts.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.can_delete_posts = true
    )
  );

-- Update connected_accounts policies to use workspace_id
DROP POLICY IF EXISTS "Users can view their own accounts" ON connected_accounts;
DROP POLICY IF EXISTS "Users can view accounts in their workspaces" ON connected_accounts;
CREATE POLICY "Users can view accounts in their workspaces"
  ON connected_accounts FOR SELECT
  USING (
    workspace_id IS NULL AND user_id = auth.uid() -- Backwards compatibility during migration
    OR
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = connected_accounts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own accounts" ON connected_accounts;
DROP POLICY IF EXISTS "Users can insert accounts in their workspaces" ON connected_accounts;
CREATE POLICY "Users can insert accounts in their workspaces"
  ON connected_accounts FOR INSERT
  WITH CHECK (
    workspace_id IS NULL AND user_id = auth.uid() -- Backwards compatibility during migration
    OR
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = connected_accounts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own accounts" ON connected_accounts;
DROP POLICY IF EXISTS "Users can update accounts in their workspaces" ON connected_accounts;
CREATE POLICY "Users can update accounts in their workspaces"
  ON connected_accounts FOR UPDATE
  USING (
    workspace_id IS NULL AND user_id = auth.uid() -- Backwards compatibility during migration
    OR
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = connected_accounts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own accounts" ON connected_accounts;
DROP POLICY IF EXISTS "Users can delete accounts in their workspaces" ON connected_accounts;
CREATE POLICY "Users can delete accounts in their workspaces"
  ON connected_accounts FOR DELETE
  USING (
    workspace_id IS NULL AND user_id = auth.uid() -- Backwards compatibility during migration
    OR
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = connected_accounts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- Note: Similar policies should be created for post_drafts and media_assets if they exist
-- This can be done in the data migration script after those tables are confirmed to exist

-- =====================================================
-- 7. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE workspaces IS 'Workspaces represent different companies/clients with fully isolated data';
COMMENT ON TABLE workspace_members IS 'Tracks which users belong to which workspaces and their roles';
COMMENT ON TABLE workspace_invitations IS 'Pending invitations to join workspaces';
COMMENT ON TABLE brand_profiles IS 'Brand identity and voice settings per workspace';

COMMENT ON COLUMN workspaces.ayr_profile_key IS 'Ayrshare API profile key - moved from user_profiles for workspace isolation';
COMMENT ON COLUMN workspaces.plan_type IS 'Subscription plan type - determines feature limits';
COMMENT ON COLUMN workspace_members.role IS 'User role in workspace: owner (1 per workspace), admin, editor, or member';
COMMENT ON COLUMN workspace_members.can_manage_team IS 'Permission to invite/remove members';
COMMENT ON COLUMN workspace_members.can_manage_settings IS 'Permission to update workspace settings';

-- Migration complete!
-- Next step: Run data migration script to migrate existing users to workspaces
