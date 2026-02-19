const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();

  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { workspaceId, userId } = req.query;

    if (!workspaceId || !userId) {
      return sendError(res, "workspaceId and userId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Check if user has access to this workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      logError('workspaces.members.checkMembership', membershipError, { userId, workspaceId });
    }

    if (!membership) {
      return sendError(res, "You don't have access to this workspace", ErrorCodes.FORBIDDEN);
    }

    // Get all workspace members (including owner)
    const { data: members, error: membersError } = await supabase
      .from('workspace_members')
      .select('id, user_id, role, created_at, can_manage_team, can_manage_settings, can_delete_posts, can_final_approval, can_approve_posts')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true });

    if (membersError) {
      logError('workspaces.members.fetchMembers', membersError, { workspaceId });
      return sendError(res, "Failed to fetch members", ErrorCodes.DATABASE_ERROR);
    }

    // Get user profiles for all members
    const userIds = members.map(m => m.user_id);

    // Only query profiles if there are members
    const { data: profiles } = userIds.length > 0
      ? await supabase
          .from('user_profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', userIds)
      : { data: [] };

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
          can_delete_posts: member.can_delete_posts,
          can_final_approval: member.can_final_approval,
          can_approve_posts: member.can_approve_posts
        },
        profile: {
          email: profile.email,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url
        }
      };
    });

    return sendSuccess(res, { members: transformedMembers });

  } catch (error) {
    logError('workspaces.members.handler', error);
    return sendError(res, "Failed to fetch workspace members", ErrorCodes.INTERNAL_ERROR);
  }
};
