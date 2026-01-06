-- Update post_drafts RLS policies to use workspace_id instead of user_id
-- This allows workspace members to access drafts

-- Drop old user-based policies
DROP POLICY IF EXISTS "Users can view their own drafts" ON post_drafts;
DROP POLICY IF EXISTS "Users can create their own drafts" ON post_drafts;
DROP POLICY IF EXISTS "Users can update their own drafts" ON post_drafts;
DROP POLICY IF EXISTS "Users can delete their own drafts" ON post_drafts;

-- Create new workspace-based policies
CREATE POLICY "Users can view drafts in their workspaces"
  ON post_drafts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = post_drafts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create drafts in their workspaces"
  ON post_drafts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = post_drafts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update drafts in their workspaces"
  ON post_drafts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = post_drafts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete drafts in their workspaces"
  ON post_drafts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = post_drafts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );