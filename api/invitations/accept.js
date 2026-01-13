/**
 * Accept a workspace invitation
 * POST /api/invitations/accept
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

// Role-based permissions
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

    const { token, userId } = body;

    if (!token || !userId) {
      return sendError(res, "token and userId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get invitation
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
          name
        )
      `)
      .eq('invite_token', token)
      .single();

    if (inviteError || !invitation) {
      console.log('Invitation not found:', { error: inviteError });
      return sendError(res, "Invitation not found", ErrorCodes.NOT_FOUND);
    }

    // Check status
    if (invitation.status !== 'pending') {
      return sendError(res, `Invitation has already been ${invitation.status}`, ErrorCodes.VALIDATION_ERROR);
    }

    // Check expiration
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('workspace_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return sendError(res, "Invitation has expired", ErrorCodes.VALIDATION_ERROR);
    }

    // Get user email
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (!userProfile) {
      return sendError(res, "User not found", ErrorCodes.NOT_FOUND);
    }

    // Verify email matches
    if (userProfile.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return sendError(
        res,
        "This invitation was sent to a different email address",
        ErrorCodes.FORBIDDEN
      );
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', invitation.workspace_id)
      .eq('user_id', userId)
      .single();

    if (existingMember) {
      // Mark invitation as accepted
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

    // Add to workspace
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
      console.error('Failed to add member:', memberError);
      logError('invitations.accept.addMember', memberError);
      return sendError(res, "Failed to join workspace", ErrorCodes.DATABASE_ERROR);
    }

    // Mark invitation as accepted
    await supabase
      .from('workspace_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    // Set as active workspace
    await supabase
      .from('user_profiles')
      .update({ last_workspace_id: invitation.workspace_id })
      .eq('id', userId);

    console.log('Invitation accepted successfully:', {
      userId,
      workspaceId: invitation.workspace_id
    });

    return sendSuccess(res, {
      message: "Successfully joined the workspace",
      workspace: invitation.workspaces
    });

  } catch (error) {
    console.error('invitations.accept error:', error);
    logError('invitations.accept.handler', error);
    return sendError(res, "Failed to accept invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
