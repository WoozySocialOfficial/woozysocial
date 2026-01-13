/**
 * Validate an invitation token
 * GET /api/invitations/validate?token=xxx
 */
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
    return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { token } = req.query;

    if (!token) {
      return sendError(res, "Token is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (typeof token !== 'string' || token.length < 10) {
      return sendError(res, "Invalid token format", ErrorCodes.VALIDATION_ERROR);
    }

    // Look up invitation by token
    const { data: invitation, error: queryError } = await supabase
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

    if (queryError || !invitation) {
      console.log('Invitation not found:', {
        tokenPrefix: token.substring(0, 8) + '...',
        error: queryError
      });
      return sendError(res, "Invitation not found", ErrorCodes.NOT_FOUND);
    }

    // Check if already accepted/rejected/cancelled
    if (invitation.status !== 'pending') {
      return sendError(
        res,
        `This invitation has already been ${invitation.status}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from('workspace_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return sendError(res, "This invitation has expired", ErrorCodes.VALIDATION_ERROR);
    }

    return sendSuccess(res, {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        invited_at: invitation.invited_at,
        expires_at: invitation.expires_at,
        workspace: invitation.workspaces
      }
    });

  } catch (error) {
    console.error('invitations.validate error:', error);
    logError('invitations.validate.handler', error);
    return sendError(res, "Failed to validate invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
