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
    const { memberId, userId } = req.body;
    const supabase = getSupabase();

    if (!supabase) {
      return res.status(500).json({ error: "Database not configured" });
    }

    if (!memberId || !userId || !workspaceId) {
      return res.status(400).json({ error: "memberId, userId, and workspaceId are required" });
    }

    // Check if user has permission to remove members
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
      return res.status(403).json({ error: "You don't have permission to remove members" });
    }

    // Cannot remove yourself
    if (memberId === userId) {
      return res.status(400).json({ error: "You cannot remove yourself from the workspace" });
    }

    // Check if target is an owner (cannot remove owners)
    const { data: targetMember } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId)
      .single();

    if (targetMember?.role === 'owner') {
      return res.status(400).json({ error: "Cannot remove the workspace owner" });
    }

    // Remove member
    const { error: deleteError } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId);

    if (deleteError) {
      console.error('Remove member error:', deleteError);
      return res.status(500).json({ error: 'Failed to remove member', details: deleteError.message });
    }

    res.status(200).json({ success: true, message: "Member removed successfully" });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to remove member", details: error.message });
  }
};
