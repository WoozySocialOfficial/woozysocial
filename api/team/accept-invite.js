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
    const { token, userId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['token', 'userId']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Fetch invitation
    const { data: invitation, error: fetchError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (fetchError || !invitation) {
      return sendError(res, "Invitation not found", ErrorCodes.NOT_FOUND);
    }

    if (invitation.status !== 'pending') {
      return sendError(
        res,
        `This invitation has already been ${invitation.status}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    if (now > expiresAt) {
      await supabase.from('team_invitations').update({ status: 'expired' }).eq('id', invitation.id);
      return sendError(res, "This invitation has expired", ErrorCodes.VALIDATION_ERROR);
    }

    // Verify user email matches invitation
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError) {
      logError('team.accept-invite.getUser', userError, { userId });
      return sendError(res, "Failed to verify user", ErrorCodes.INTERNAL_ERROR);
    }

    const userEmail = userData?.user?.email?.toLowerCase();

    if (!userEmail || userEmail !== invitation.email.toLowerCase()) {
      return sendError(
        res,
        "This invitation was sent to a different email address",
        ErrorCodes.FORBIDDEN
      );
    }

    // Add user to team
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        owner_id: invitation.owner_id,
        member_id: userId,
        role: invitation.role,
        joined_at: new Date().toISOString()
      });

    if (memberError) {
      logError('team.accept-invite.addMember', memberError, { userId, ownerId: invitation.owner_id });
      return sendError(res, "Failed to add you to the team", ErrorCodes.DATABASE_ERROR);
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('team_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    if (updateError) {
      logError('team.accept-invite.updateStatus', updateError, { invitationId: invitation.id });
    }

    return sendSuccess(res, {
      message: "Successfully joined the team!",
      role: invitation.role
    });

  } catch (error) {
    logError('team.accept-invite.handler', error);
    return sendError(res, "Failed to accept invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
