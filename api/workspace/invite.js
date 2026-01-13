const { Resend } = require("resend");
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
  isValidEmail,
  isServiceConfigured
} = require("../_utils");

const VALID_ROLES = ['admin', 'editor', 'view_only', 'client'];

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

      // Note: We allow updating pending invitations for resend functionality
      // The frontend handles the "already sent" warning

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

      // Get workspace name for the email
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .single();

      // Send email if Resend is configured
      if (isServiceConfigured('resend')) {
        const resend = new Resend(process.env.RESEND_API_KEY);

        const { data: inviterData } = await supabase
          .from('user_profiles')
          .select('full_name, email')
          .eq('id', invitedBy)
          .single();

        const inviterName = inviterData?.full_name || inviterData?.email || 'A team member';
        const workspaceName = workspace?.name || 'a workspace';
        const assignedRole = role || 'editor';
        // Use APP_URL first (correct), ignore FRONTEND_URL (wrong domain)
        const appUrl = (process.env.APP_URL || 'https://api.woozysocial.com').trim();
        const inviteLink = `${appUrl}/accept-invite?token=${invitation.invite_token}`;

        try {
          await resend.emails.send({
            from: 'Woozy Social <hello@woozysocial.com>',
            to: [email],
            subject: `${inviterName} invited you to join ${workspaceName} on Woozy Social`,
            html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #F1F6F4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 2px solid #e0e0e0;">
          <tr>
            <td style="padding: 40px; text-align: center; background-color: #114C5A; border-radius: 14px 14px 0 0;">
              <h1 style="margin: 0; color: #FFC801; font-size: 28px; font-weight: 700;">You've been invited!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #114C5A; line-height: 1.6;">
                <strong>${inviterName}</strong> has invited you to join <strong>${workspaceName}</strong> on Woozy Social.
              </p>
              <p style="margin: 0 0 30px 0; font-size: 16px; color: #114C5A;">
                Role: <strong>${assignedRole}</strong>
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 8px; background-color: #FFC801;">
                    <a href="${inviteLink}" target="_blank" style="display: inline-block; padding: 16px 32px; font-size: 16px; font-weight: 700; color: #114C5A; text-decoration: none;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: #666; line-height: 1.6;">
                This invitation expires in 7 days.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #F1F6F4; border-radius: 0 0 14px 14px; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; font-size: 12px; color: #666; text-align: center;">
                If the button doesn't work, copy and paste this link:<br>
                <a href="${inviteLink}" style="color: #114C5A; word-break: break-all;">${inviteLink}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
          });
        } catch (emailError) {
          logError('workspace.invite.sendEmail', emailError, { workspaceId });
          // Don't fail the request if email fails
        }
      }

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
