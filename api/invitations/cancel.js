/**
 * Cancel a workspace invitation
 * POST /api/invitations/cancel
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

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
  }

  try {
    // Parse body
    let body = req.body;
    if (!body || Object.keys(body).length === 0) {
      body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({}); }
        });
      });
    }

    const { invitationId, userId } = body;

    if (!invitationId || !userId) {
      return sendError(res, "invitationId and userId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(invitationId) || !isValidUUID(userId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('workspace_invitations')
      .select('id, workspace_id, status')
      .eq('id', invitationId)
      .single();

    if (inviteError || !invitation) {
      return sendError(res, "Invitation not found", ErrorCodes.NOT_FOUND);
    }

    // Check permission
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', invitation.workspace_id)
      .eq('user_id', userId)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return sendError(res, "Only owners and admins can cancel invitations", ErrorCodes.FORBIDDEN);
    }

    // Delete the invitation
    const { error: deleteError } = await supabase
      .from('workspace_invitations')
      .delete()
      .eq('id', invitationId);

    if (deleteError) {
      console.error('Failed to delete invitation:', deleteError);
      logError('invitations.cancel.delete', deleteError);
      return sendError(res, "Failed to cancel invitation", ErrorCodes.DATABASE_ERROR);
    }

    console.log('Invitation cancelled:', invitationId);

    return sendSuccess(res, {
      message: "Invitation cancelled successfully"
    });

  } catch (error) {
    console.error('invitations.cancel error:', error);
    logError('invitations.cancel.handler', error);
    return sendError(res, "Failed to cancel invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
