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
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({ error: "You don't have access to this workspace" });
    }

    // Get all workspace members (exclude owner from display, they're shown separately)
    const { data: members, error: membersError } = await supabase
      .from('workspace_members')
      .select('id, user_id, role, joined_at, created_at, can_manage_team, can_manage_settings, can_delete_posts')
      .eq('workspace_id', workspaceId)
      .neq('role', 'owner')
      .order('created_at', { ascending: true });

    if (membersError) {
      console.error('Members query error:', membersError);
      return res.status(500).json({ error: 'Failed to fetch members', details: membersError.message });
    }

    // Get user profiles for all members
    const userIds = members.map(m => m.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, avatar_url')
      .in('id', userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    // Transform the data for the frontend (profile nested for frontend compatibility)
    const transformedMembers = members.map(member => {
      const profile = profileMap[member.user_id] || {};
      return {
        id: member.id,
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at || member.created_at,
        created_at: member.created_at,
        permissions: {
          can_manage_team: member.can_manage_team,
          can_manage_settings: member.can_manage_settings,
          can_delete_posts: member.can_delete_posts
        },
        profile: {
          email: profile.email,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url
        }
      };
    });

    res.status(200).json({ success: true, members: transformedMembers });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to fetch workspace members", details: error.message });
  }
};
