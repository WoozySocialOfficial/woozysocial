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
const {
  sendInviteAcceptedNotification,
  sendMemberJoinedNotification
} = require("../notifications/helpers");

// Role-based permission defaults
const ROLE_PERMISSIONS = {
  owner: {
    can_manage_team: true,
    can_manage_settings: true,
    can_delete_posts: true,
    can_approve_posts: true
  },
  admin: {
    can_manage_team: true,
    can_manage_settings: true,
    can_delete_posts: true,
    can_approve_posts: true
  },
  editor: {
    can_manage_team: false,
    can_manage_settings: false,
    can_delete_posts: true,
    can_approve_posts: false
  },
  view_only: {
    can_manage_team: false,
    can_manage_settings: false,
    can_delete_posts: false,
    can_approve_posts: false
  },
  client: {
    can_manage_team: false,
    can_manage_settings: false,
    can_delete_posts: false,
    can_approve_posts: true
  }
};

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

    // Get the invitation by invite_token
    const { data: invitation, error: inviteError } = await supabase
      .from('workspace_invitations')
      .select(`
        id,
        workspace_id,
        email,
        role,
        status,
        expires_at,
        invited_by,
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
      logError('workspace.accept-invite.getInvitation', inviteError || 'Not found', {
        tokenPrefix: inviteToken.substring(0, 8) + '...'
      });
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

    // Get user's email and name to verify
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('email, full_name')
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

    // Add user to workspace with role-based permissions
    const permissions = ROLE_PERMISSIONS[invitation.role] || ROLE_PERMISSIONS.editor;
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: invitation.workspace_id,
        user_id: userId,
        role: invitation.role,
        can_manage_team: permissions.can_manage_team,
        can_manage_settings: permissions.can_manage_settings,
        can_delete_posts: permissions.can_delete_posts,
        can_approve_posts: permissions.can_approve_posts
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

    // Send notifications (non-blocking)
    const acceptedByName = userData?.full_name || userData?.email || 'A new member';

    // Notify the inviter
    if (invitation.invited_by) {
      sendInviteAcceptedNotification(supabase, {
        workspaceId: invitation.workspace_id,
        inviterId: invitation.invited_by,
        acceptedByUserId: userId,
        acceptedByName
      }).catch(err => logError('workspace.accept-invite.notifyInviter', err));
    }

    // Notify workspace admins/owners
    const { data: admins } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', invitation.workspace_id)
      .in('role', ['owner', 'admin']);

    if (admins && admins.length > 0) {
      sendMemberJoinedNotification(supabase, {
        workspaceId: invitation.workspace_id,
        newMemberName: acceptedByName,
        newMemberId: userId,
        notifyUserIds: admins.map(a => a.user_id)
      }).catch(err => logError('workspace.accept-invite.notifyAdmins', err));
    }

    return sendSuccess(res, {
      message: "Successfully joined the workspace",
      workspace: invitation.workspaces
    });

  } catch (error) {
    logError('workspace.accept-invite.handler', error);
    return sendError(res, "Failed to accept invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
