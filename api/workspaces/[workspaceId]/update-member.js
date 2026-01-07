const { setCors, getSupabase } = require("../../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { workspaceId } = req.query;
    const { memberId, userId, role, permissions } = req.body;
    const supabase = getSupabase();

    if (!supabase) {
      return res.status(500).json({ error: "Database not configured" });
    }

    if (!memberId || !userId || !workspaceId) {
      return res.status(400).json({ error: "memberId, userId, and workspaceId are required" });
    }

    // Check if user has permission to update members
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role, can_manage_team')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({ error: "You don't have access to this workspace" });
    }

    if (!membership.can_manage_team && membership.role !== 'owner') {
      return res.status(403).json({ error: "You don't have permission to update members" });
    }

    // Cannot change your own role
    if (memberId === userId) {
      return res.status(400).json({ error: "You cannot change your own role" });
    }

    // Cannot change owner's role
    const { data: targetMember } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId)
      .single();

    if (targetMember?.role === 'owner') {
      return res.status(400).json({ error: "Cannot modify the workspace owner's role" });
    }

    // Build update object
    const updateData = {};
    if (role) updateData.role = role;
    if (permissions) {
      if (permissions.canManageTeam !== undefined) updateData.can_manage_team = permissions.canManageTeam;
      if (permissions.canManageSettings !== undefined) updateData.can_manage_settings = permissions.canManageSettings;
      if (permissions.canDeletePosts !== undefined) updateData.can_delete_posts = permissions.canDeletePosts;
    }

    // Update member
    const { error: updateError } = await supabase
      .from('workspace_members')
      .update(updateData)
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId);

    if (updateError) {
      console.error('Update member error:', updateError);
      return res.status(500).json({ error: 'Failed to update member', details: updateError.message });
    }

    res.status(200).json({ success: true, message: "Member updated successfully" });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to update member", details: error.message });
  }
};
