const {
  setCors,
  getSupabase,
  parseBody,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidUUID,
  isValidEmail
} = require("../_utils");

const VALID_ROLES = ['admin', 'editor', 'view_only'];

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  // POST - Send invitation
  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { workspaceId, email, role, invitedBy } = body;

      // Validate required fields
      const validation = validateRequired(body, ['workspaceId', 'email', 'invitedBy']);
      if (!validation.valid) {
        return sendError(
          res,
          `Missing required fields: ${validation.missing.join(', ')}`,
          ErrorCodes.VALIDATION_ERROR
        );
      }

      if (!isValidUUID(workspaceId) || !isValidUUID(invitedBy)) {
        return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
      }

      if (!isValidEmail(email)) {
        return sendError(res, "Invalid email format", ErrorCodes.VALIDATION_ERROR);
      }

      // Validate role if provided
      if (role && !VALID_ROLES.includes(role)) {
        return sendError(
          res,
          `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
          ErrorCodes.VALIDATION_ERROR
        );
      }

      // Verify inviter is owner/admin of workspace
      const { data: membership, error: membershipError } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', invitedBy)
        .single();

      if (membershipError && membershipError.code !== 'PGRST116') {
        logError('workspace.invite.checkMembership', membershipError, { workspaceId, invitedBy });
      }

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return sendError(res, "Only owners and admins can invite members", ErrorCodes.FORBIDDEN);
      }

      // Check for existing pending invitation
      const { data: existingInvite, error: existingError } = await supabase
        .from('workspace_invitations')
        .select('id, status')
        .eq('workspace_id', workspaceId)
        .eq('email', email.toLowerCase())
        .single();

      if (existingError && existingError.code !== 'PGRST116') {
        logError('workspace.invite.checkExisting', existingError, { workspaceId, email });
      }

      if (existingInvite && existingInvite.status === 'pending') {
        return sendError(res, "An invitation is already pending for this email", ErrorCodes.VALIDATION_ERROR);
      }

      // Create or update invitation
      const inviteData = {
        workspace_id: workspaceId,
        email: email.toLowerCase(),
        role: role || 'editor',
        invited_by: invitedBy,
        status: 'pending',
        invited_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };

      let invitation;
      if (existingInvite) {
        // Update existing invitation
        const { data, error } = await supabase
          .from('workspace_invitations')
          .update(inviteData)
          .eq('id', existingInvite.id)
          .select()
          .single();

        if (error) {
          logError('workspace.invite.update', error, { inviteId: existingInvite.id });
          return sendError(res, "Failed to update invitation", ErrorCodes.DATABASE_ERROR);
        }
        invitation = data;
      } else {
        // Create new invitation
        const { data, error } = await supabase
          .from('workspace_invitations')
          .insert(inviteData)
          .select()
          .single();

        if (error) {
          logError('workspace.invite.create', error, { workspaceId, email });
          return sendError(res, "Failed to create invitation", ErrorCodes.DATABASE_ERROR);
        }
        invitation = data;
      }

      // Get workspace name for the response
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .single();

      return sendSuccess(res, {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          inviteToken: invitation.invite_token,
          workspaceName: workspace?.name
        }
      });

    } catch (error) {
      logError('workspace.invite.post.handler', error);
      return sendError(res, "Failed to create invitation", ErrorCodes.INTERNAL_ERROR);
    }
  }

  // GET - List invitations for a workspace
  else if (req.method === "GET") {
    try {
      const { workspaceId } = req.query;

      if (!workspaceId) {
        return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
      }

      if (!isValidUUID(workspaceId)) {
        return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
      }

      const { data: invitations, error } = await supabase
        .from('workspace_invitations')
        .select(`
          id,
          email,
          role,
          status,
          invited_at,
          expires_at,
          accepted_at
        `)
        .eq('workspace_id', workspaceId)
        .order('invited_at', { ascending: false });

      if (error) {
        logError('workspace.invite.list', error, { workspaceId });
        return sendError(res, "Failed to fetch invitations", ErrorCodes.DATABASE_ERROR);
      }

      return sendSuccess(res, { invitations: invitations || [] });

    } catch (error) {
      logError('workspace.invite.get.handler', error);
      return sendError(res, "Failed to fetch invitations", ErrorCodes.INTERNAL_ERROR);
    }
  }

  // DELETE - Cancel invitation
  else if (req.method === "DELETE") {
    try {
      const { invitationId, userId } = req.query;

      if (!invitationId || !userId) {
        return sendError(res, "invitationId and userId are required", ErrorCodes.VALIDATION_ERROR);
      }

      if (!isValidUUID(invitationId) || !isValidUUID(userId)) {
        return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
      }

      // Get invitation to verify workspace
      const { data: invitation, error: inviteError } = await supabase
        .from('workspace_invitations')
        .select('workspace_id')
        .eq('id', invitationId)
        .single();

      if (inviteError || !invitation) {
        return sendError(res, "Invitation not found", ErrorCodes.NOT_FOUND);
      }

      // Verify user is owner/admin
      const { data: membership, error: membershipError } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', invitation.workspace_id)
        .eq('user_id', userId)
        .single();

      if (membershipError && membershipError.code !== 'PGRST116') {
        logError('workspace.invite.delete.checkMembership', membershipError, { userId });
      }

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return sendError(res, "Only owners and admins can cancel invitations", ErrorCodes.FORBIDDEN);
      }

      const { error } = await supabase
        .from('workspace_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) {
        logError('workspace.invite.delete', error, { invitationId });
        return sendError(res, "Failed to cancel invitation", ErrorCodes.DATABASE_ERROR);
      }

      return sendSuccess(res, { message: "Invitation cancelled successfully" });

    } catch (error) {
      logError('workspace.invite.delete.handler', error);
      return sendError(res, "Failed to cancel invitation", ErrorCodes.INTERNAL_ERROR);
    }
  }

  else {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }
};
