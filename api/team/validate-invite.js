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

    // Validate token format (basic check)
    if (typeof token !== 'string' || token.length < 10) {
      return sendError(res, "Invalid token format", ErrorCodes.VALIDATION_ERROR);
    }

    const { data: invitation, error } = await supabase
      .from('team_invitations')
      .select('id, email, role, status, invited_at, expires_at, owner_id')
      .eq('invite_token', token)
      .single();

    if (error || !invitation) {
      return sendError(res, "Invitation not found", ErrorCodes.NOT_FOUND);
    }

    // Check if invitation has expired
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      // Update status to expired
      await supabase
        .from('team_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return sendError(res, "This invitation has expired", ErrorCodes.VALIDATION_ERROR);
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return sendError(
        res,
        `This invitation has already been ${invitation.status}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    return sendSuccess(res, {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        invitedAt: invitation.invited_at,
        expiresAt: invitation.expires_at
      }
    });
  } catch (error) {
    logError('team.validate-invite.handler', error);
    return sendError(res, "Failed to validate invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
