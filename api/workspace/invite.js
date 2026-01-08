const { setCors, getSupabase, parseBody } = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Database not configured" });
  }

  // POST - Send invitation
  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { workspaceId, email, role, invitedBy } = body;

      if (!workspaceId || !email || !invitedBy) {
        return res.status(400).json({ error: "workspaceId, email, and invitedBy are required" });
      }

      // Verify inviter is owner/admin of workspace
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', invitedBy)
        .single();

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return res.status(403).json({ error: "Only owners and admins can invite members" });
      }

      // Check if user is already a member
      const { data: existingUser } = await supabase
        .from('auth.users')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        const { data: existingMember } = await supabase
          .from('workspace_members')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('user_id', existingUser.id)
          .single();

        if (existingMember) {
          return res.status(400).json({ error: "User is already a member of this workspace" });
        }
      }

      // Check for existing pending invitation
      const { data: existingInvite } = await supabase
        .from('workspace_invitations')
        .select('id, status')
        .eq('workspace_id', workspaceId)
        .eq('email', email)
        .single();

      if (existingInvite && existingInvite.status === 'pending') {
        return res.status(400).json({ error: "An invitation is already pending for this email" });
      }

      // Create or update invitation
      const inviteData = {
        workspace_id: workspaceId,
        email: email.toLowerCase(),
        role: role || 'editor',
        invited_by: invitedBy,
        status: 'pending',
        invited_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };

      let invitation;
      if (existingInvite) {
        // Update existing invitation
        const { data, error } = await supabase
          .from('workspace_invitations')
          .update(inviteData)
          .eq('id', existingInvite.id)
          .select()
          .single();

        if (error) throw error;
        invitation = data;
      } else {
        // Create new invitation
        const { data, error } = await supabase
          .from('workspace_invitations')
          .insert(inviteData)
          .select()
          .single();

        if (error) throw error;
        invitation = data;
      }

      // Get workspace name for the response
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .single();

      res.status(200).json({
        success: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          inviteToken: invitation.invite_token,
          workspaceName: workspace?.name
        }
      });

    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  }

  // GET - List invitations for a workspace
  else if (req.method === "GET") {
    try {
      const { workspaceId, userId } = req.query;

      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId is required" });
      }

      const { data: invitations, error } = await supabase
        .from('workspace_invitations')
        .select(`
          id,
          email,
          role,
          status,
          invited_at,
          expires_at,
          accepted_at
        `)
        .eq('workspace_id', workspaceId)
        .order('invited_at', { ascending: false });

      if (error) throw error;

      res.status(200).json({
        success: true,
        invitations: invitations || []
      });

    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  }

  // DELETE - Cancel invitation
  else if (req.method === "DELETE") {
    try {
      const { invitationId, userId } = req.query;

      if (!invitationId || !userId) {
        return res.status(400).json({ error: "invitationId and userId are required" });
      }

      // Get invitation to verify workspace
      const { data: invitation } = await supabase
        .from('workspace_invitations')
        .select('workspace_id')
        .eq('id', invitationId)
        .single();

      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      // Verify user is owner/admin
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', invitation.workspace_id)
        .eq('user_id', userId)
        .single();

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return res.status(403).json({ error: "Only owners and admins can cancel invitations" });
      }

      const { error } = await supabase
        .from('workspace_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      res.status(200).json({ success: true });

    } catch (error) {
      console.error("Error cancelling invitation:", error);
      res.status(500).json({ error: "Failed to cancel invitation" });
    }
  }

  else {
    res.status(405).json({ error: "Method not allowed" });
  }
};
