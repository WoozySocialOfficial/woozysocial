const { setCors, getSupabase } = require("../../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { workspaceId, userId } = req.query;
    const supabase = getSupabase();

    if (!supabase) {
      return res.status(500).json({ error: "Database not configured" });
    }

    if (!workspaceId || !userId) {
      return res.status(400).json({ error: "workspaceId and userId are required" });
    }

    // Check if user has access to this workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role, can_manage_team')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({ error: "You don't have access to this workspace" });
    }

    // Get all pending invitations for this workspace
    const { data: invitations, error: invitationsError } = await supabase
      .from('workspace_invitations')
      .select('id, email, role, status, invited_at, expires_at, invited_by')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false });

    if (invitationsError) {
      console.error('Invitations query error:', invitationsError);
      return res.status(500).json({ error: 'Failed to fetch invitations', details: invitationsError.message });
    }

    // Get user profiles for inviters
    const inviterIds = [...new Set(invitations.map(i => i.invited_by).filter(Boolean))];
    const { data: profiles } = inviterIds.length > 0 ? await supabase
      .from('user_profiles')
      .select('id, email, full_name')
      .in('id', inviterIds) : { data: [] };

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    // Transform the data for the frontend
    const transformedInvitations = invitations.map(invite => {
      const inviter = profileMap[invite.invited_by] || {};
      return {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        invited_at: invite.invited_at,
        expires_at: invite.expires_at,
        invited_by_name: inviter.full_name || inviter.email
      };
    });

    res.status(200).json({ success: true, invitations: transformedInvitations });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to fetch invitations", details: error.message });
  }
};
