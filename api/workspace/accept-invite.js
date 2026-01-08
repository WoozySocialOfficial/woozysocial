const {
  setCors,
  getSupabase,
  parseBody,
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
    const body = await parseBody(req);
    const { inviteToken, userId } = body;

    // Validate required fields
    const validation = validateRequired(body, ['inviteToken', 'userId']);
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

    // Validate token format
    if (typeof inviteToken !== 'string' || inviteToken.length < 10) {
      return sendError(res, "Invalid invite token format", ErrorCodes.VALIDATION_ERROR);
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
        expires_at,
        workspaces (
          id,
          name,
          slug,
          logo_url
        )
      `)
      .eq('invite_token', inviteToken)
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

    // Get user's email to verify
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (userError) {
      logError('workspace.accept-invite.getUser', userError, { userId });
      return sendError(res, "Failed to verify user", ErrorCodes.INTERNAL_ERROR);
    }

    // Verify email matches (case-insensitive)
    if (userData?.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return sendError(
        res,
        "This invitation was sent to a different email address",
        ErrorCodes.FORBIDDEN
      );
    }

    // Check if user is already a member
    const { data: existingMember, error: memberCheckError } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', invitation.workspace_id)
      .eq('user_id', userId)
      .single();

    if (memberCheckError && memberCheckError.code !== 'PGRST116') {
      logError('workspace.accept-invite.checkMember', memberCheckError, { userId });
    }

    if (existingMember) {
      // Update invitation to accepted
      await supabase
        .from('workspace_invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitation.id);

      return sendSuccess(res, {
        message: "You are already a member of this workspace",
        workspace: invitation.workspaces
      });
    }

    // Add user to workspace
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: invitation.workspace_id,
        user_id: userId,
        role: invitation.role
      });

    if (memberError) {
      logError('workspace.accept-invite.addMember', memberError, { userId, workspaceId: invitation.workspace_id });
      return sendError(res, "Failed to add you to the workspace", ErrorCodes.DATABASE_ERROR);
    }

    // Update invitation status
    await supabase
      .from('workspace_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    // Update user's last workspace
    await supabase
      .from('user_profiles')
      .update({ last_workspace_id: invitation.workspace_id })
      .eq('id', userId);

    return sendSuccess(res, {
      message: "Successfully joined the workspace",
      workspace: invitation.workspaces
    });

  } catch (error) {
    logError('workspace.accept-invite.handler', error);
    return sendError(res, "Failed to accept invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
