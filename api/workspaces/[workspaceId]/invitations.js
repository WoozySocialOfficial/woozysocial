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
      .select('role, can_manage_team')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      logError('workspaces.invitations.checkMembership', membershipError, { userId, workspaceId });
    }

    if (!membership) {
      return sendError(res, "You don't have access to this workspace", ErrorCodes.FORBIDDEN);
    }

    // Get all pending invitations for this workspace
    // Select both invited_at and created_at for compatibility (different migrations)
    const { data: invitations, error: invitationsError } = await supabase
      .from('workspace_invitations')
      .select('id, email, role, status, invited_at, created_at, expires_at, invited_by')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (invitationsError) {
      logError('workspaces.invitations.fetch', invitationsError, { workspaceId });
      return sendError(res, "Failed to fetch invitations", ErrorCodes.DATABASE_ERROR);
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
        invited_at: invite.invited_at || invite.created_at, // Fallback for compatibility
        expires_at: invite.expires_at,
        invited_by_name: inviter.full_name || inviter.email
      };
    });

    return sendSuccess(res, { invitations: transformedInvitations });

  } catch (error) {
    logError('workspaces.invitations.handler', error);
    return sendError(res, "Failed to fetch invitations", ErrorCodes.INTERNAL_ERROR);
  }
};
