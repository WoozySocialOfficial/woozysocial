/**
 * List all pending invitations for a workspace
 * GET /api/invitations/list?workspaceId=xxx&userId=xxx
 */
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../_utils");

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
    return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { workspaceId, userId } = req.query;

    if (!workspaceId || !userId) {
      return sendError(res, "workspaceId and userId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId) || !isValidUUID(userId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    // Check if user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      return sendError(res, "You don't have access to this workspace", ErrorCodes.FORBIDDEN);
    }

    // Get all pending invitations
    const { data: invitations, error: queryError } = await supabase
      .from('workspace_invitations')
      .select('id, email, role, status, invited_at, expires_at, invited_by')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false });

    if (queryError) {
      logError('invitations.list.query', queryError);
      return sendError(res, "Failed to fetch invitations", ErrorCodes.DATABASE_ERROR);
    }

    // Get inviter names
    const inviterIds = [...new Set(invitations.map(i => i.invited_by).filter(Boolean))];
    const { data: profiles } = inviterIds.length > 0 ? await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', inviterIds) : { data: [] };

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    // Format response
    const formattedInvitations = invitations.map(inv => {
      const inviter = profileMap[inv.invited_by] || {};
      return {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        invited_at: inv.invited_at,
        expires_at: inv.expires_at,
        invited_by_name: inviter.full_name || inviter.email
      };
    });

    return sendSuccess(res, {
      invitations: formattedInvitations
    });

  } catch (error) {
    console.error('invitations.list error:', error);
    logError('invitations.list.handler', error);
    return sendError(res, "Failed to list invitations", ErrorCodes.INTERNAL_ERROR);
  }
};
