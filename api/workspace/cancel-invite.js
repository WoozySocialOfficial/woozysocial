const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidUUID
} = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();

  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { inviteId, workspaceId, userId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['inviteId', 'userId']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(inviteId) || !isValidUUID(userId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get the invitation
    const { data: invite, error } = await supabase
      .from('workspace_invitations')
      .select('id, workspace_id, status')
      .eq('id', inviteId)
      .single();

    if (error || !invite) {
      return sendError(res, "Invitation not found", ErrorCodes.NOT_FOUND);
    }

    // If workspaceId provided, verify it matches
    if (workspaceId && invite.workspace_id !== workspaceId) {
      return sendError(res, "Invitation does not belong to this workspace", ErrorCodes.FORBIDDEN);
    }

    // Check if user has permission to cancel (must be owner/admin of workspace)
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', invite.workspace_id)
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      logError('workspace.cancel-invite.checkMembership', membershipError, { userId, workspaceId: invite.workspace_id });
    }

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return sendError(res, "Not authorized to cancel this invitation", ErrorCodes.FORBIDDEN);
    }

    if (invite.status !== 'pending') {
      return sendError(res, "Only pending invitations can be cancelled", ErrorCodes.VALIDATION_ERROR);
    }

    // Cancel the invitation
    const { error: updateError } = await supabase
      .from('workspace_invitations')
      .update({ status: 'cancelled' })
      .eq('id', inviteId);

    if (updateError) {
      logError('workspace.cancel-invite.update', updateError, { inviteId });
      return sendError(res, "Failed to cancel invitation", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, { message: "Invitation cancelled successfully" });
  } catch (error) {
    logError('workspace.cancel-invite.handler', error);
    return sendError(res, "Failed to cancel invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
