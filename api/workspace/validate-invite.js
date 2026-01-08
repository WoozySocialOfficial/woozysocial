const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError
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
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { token } = req.query;

    if (!token) {
      return sendError(res, "Token is required", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate token format
    if (typeof token !== 'string' || token.length < 10) {
      return sendError(res, "Invalid token format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get the invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('workspace_invitations')
      .select(`
        id,
        workspace_id,
        email,
        role,
        status,
        invited_at,
        expires_at,
        workspaces (
          id,
          name,
          slug,
          logo_url
        )
      `)
      .eq('invite_token', token)
      .single();

    if (inviteError || !invitation) {
      return sendError(res, "Invitation not found", ErrorCodes.NOT_FOUND);
    }

    // Check if invitation is still valid
    if (invitation.status !== 'pending') {
      return sendError(
        res,
        `Invitation has already been ${invitation.status}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (new Date(invitation.expires_at) < new Date()) {
      // Update status to expired
      await supabase
        .from('workspace_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return sendError(res, "Invitation has expired", ErrorCodes.VALIDATION_ERROR);
    }

    return sendSuccess(res, {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        invitedAt: invitation.invited_at,
        expiresAt: invitation.expires_at,
        workspace: invitation.workspaces
      }
    });

  } catch (error) {
    logError('workspace.validate-invite.handler', error);
    return sendError(res, "Failed to validate invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
