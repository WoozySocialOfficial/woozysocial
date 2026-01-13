/**
 * Create (or resend) a workspace invitation
 * POST /api/invitations/create
 */
const { Resend } = require("resend");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
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

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
  }

  try {
    // Parse body (Vercel auto-parses, but handle raw body too)
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

    const { workspaceId, email, role, userId } = body;

    // Validate inputs
    if (!workspaceId || !email || !userId) {
      return sendError(res, "workspaceId, email, and userId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId) || !isValidUUID(userId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidEmail(email)) {
      return sendError(res, "Invalid email format", ErrorCodes.VALIDATION_ERROR);
    }

    const inviteRole = role && VALID_ROLES.includes(role) ? role : 'editor';

    // Check if user is owner/admin of workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return sendError(res, "Only owners and admins can invite members", ErrorCodes.FORBIDDEN);
    }

    // Check if user is already a member
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (userProfile) {
      const { data: existingMember } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userProfile.id)
        .single();

      if (existingMember) {
        return sendError(res, "This user is already a member of the workspace", ErrorCodes.VALIDATION_ERROR);
      }
    }

    // Check for existing pending invitation
    const { data: existingInvite } = await supabase
      .from('workspace_invitations')
      .select('id, invite_token, status')
      .eq('workspace_id', workspaceId)
      .eq('email', email.toLowerCase())
      .single();

    let invitation;

    if (existingInvite && existingInvite.status === 'pending') {
      // Update existing pending invitation (resend)
      const { data: updated, error: updateError } = await supabase
        .from('workspace_invitations')
        .update({
          role: inviteRole,
          invited_by: userId,
          invited_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', existingInvite.id)
        .select()
        .single();

      if (updateError) {
        logError('invitations.create.update', updateError);
        return sendError(res, "Failed to update invitation", ErrorCodes.DATABASE_ERROR);
      }

      invitation = updated;
    } else if (existingInvite) {
      // Delete old non-pending invitation and create new one
      await supabase
        .from('workspace_invitations')
        .delete()
        .eq('id', existingInvite.id);

      const { data: created, error: createError } = await supabase
        .from('workspace_invitations')
        .insert({
          workspace_id: workspaceId,
          email: email.toLowerCase(),
          role: inviteRole,
          invited_by: userId,
          status: 'pending'
        })
        .select()
        .single();

      if (createError) {
        logError('invitations.create.insert', createError);
        return sendError(res, "Failed to create invitation", ErrorCodes.DATABASE_ERROR);
      }

      invitation = created;
    } else {
      // Create new invitation
      const { data: created, error: createError } = await supabase
        .from('workspace_invitations')
        .insert({
          workspace_id: workspaceId,
          email: email.toLowerCase(),
          role: inviteRole,
          invited_by: userId,
          status: 'pending'
        })
        .select()
        .single();

      if (createError) {
        logError('invitations.create.insert', createError);
        return sendError(res, "Failed to create invitation", ErrorCodes.DATABASE_ERROR);
      }

      invitation = created;
    }

    // Get workspace and inviter info for email
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single();

    const { data: inviter } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    // Send invitation email
    if (isServiceConfigured('resend')) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const inviterName = inviter?.full_name || inviter?.email || 'Someone';
      const workspaceName = workspace?.name || 'a workspace';
      const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://api.woozysocial.com';
      const inviteLink = `${appUrl}/accept-invite?token=${invitation.invite_token}`;

      try {
        await resend.emails.send({
          from: 'Woozy Social <hello@woozysocial.com>',
          to: [email],
          subject: `${inviterName} invited you to join ${workspaceName}`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #F1F6F4;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 2px solid #e0e0e0;">
    <div style="padding: 40px; text-align: center; background-color: #114C5A;">
      <h1 style="margin: 0; color: #FFC801; font-size: 28px; font-weight: 700;">You're Invited!</h1>
    </div>
    <div style="padding: 40px;">
      <p style="margin: 0 0 20px 0; font-size: 16px; color: #114C5A; line-height: 1.6;">
        <strong>${inviterName}</strong> has invited you to join <strong>${workspaceName}</strong> on Woozy Social.
      </p>
      <p style="margin: 0 0 30px 0; font-size: 16px; color: #114C5A;">
        Role: <strong>${inviteRole}</strong>
      </p>
      <div style="text-align: center;">
        <a href="${inviteLink}" style="display: inline-block; padding: 16px 32px; font-size: 16px; font-weight: 700; color: #114C5A; background-color: #FFC801; text-decoration: none; border-radius: 8px;">
          Accept Invitation
        </a>
      </div>
      <p style="margin: 30px 0 0 0; font-size: 14px; color: #666; line-height: 1.6; text-align: center;">
        This invitation expires in 7 days.
      </p>
    </div>
    <div style="padding: 20px 40px; background-color: #F1F6F4; border-top: 1px solid #e0e0e0;">
      <p style="margin: 0; font-size: 12px; color: #666; text-align: center;">
        If the button doesn't work, copy and paste this link:<br>
        <a href="${inviteLink}" style="color: #114C5A; word-break: break-all;">${inviteLink}</a>
      </p>
    </div>
  </div>
</body>
</html>`
        });
      } catch (emailError) {
        logError('invitations.create.sendEmail', emailError);
        // Don't fail if email fails
      }
    }

    return sendSuccess(res, {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        inviteToken: invitation.invite_token,
        expiresAt: invitation.expires_at
      }
    });

  } catch (error) {
    console.error('invitations.create error:', error);
    logError('invitations.create.handler', error);
    return sendError(res, "Failed to create invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
