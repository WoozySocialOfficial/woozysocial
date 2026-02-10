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
const {
  verifyWorkspaceMembership,
  checkPermission,
  canInviteTeamMember
} = require("../_utils-access-control");

const VALID_ROLES = ['member', 'viewer'];

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

    const inviteRole = role && VALID_ROLES.includes(role) ? role : 'member';

    // Verify workspace membership
    const membershipCheck = await verifyWorkspaceMembership(supabase, userId, workspaceId);
    if (!membershipCheck.success) {
      return sendError(res, membershipCheck.error, ErrorCodes.FORBIDDEN);
    }

    const member = membershipCheck.member;

    // Check if user has permission to invite team members
    const permissionCheck = checkPermission(member, 'canManageTeam');
    if (!permissionCheck.success) {
      return sendError(res, "Only owners and admins can invite members", ErrorCodes.FORBIDDEN);
    }

    // Check team member limit based on workspace owner's subscription tier
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .single();

    if (workspace) {
      const { data: ownerProfile } = await supabase
        .from('user_profiles')
        .select('subscription_tier, subscription_status')
        .eq('id', workspace.owner_id)
        .single();

      if (ownerProfile) {
        // Count current members
        const { count: memberCount } = await supabase
          .from('workspace_members')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId);

        const tier = ownerProfile.subscription_tier || 'free';
        const canInvite = canInviteTeamMember(tier, (memberCount || 0) + 1); // +1 for new member

        if (!canInvite) {
          return sendError(res, "Team member limit reached for current subscription tier", 'PAYMENT_REQUIRED');
        }
      }
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
    const { data: workspaceData } = await supabase
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
      const workspaceName = workspaceData?.name || 'a workspace';
      // Use APP_URL environment variable for invitation links (must be frontend domain)
      const appUrl = (process.env.APP_URL || 'https://woozysocials.com').trim();
      const inviteLink = `${appUrl}/accept-invite?token=${invitation.invite_token}`;

      try {
        await resend.emails.send({
          from: 'Woozy Social <hello@woozysocials.com>',
          to: [email],
          subject: `${inviterName} invited you to join ${workspaceName}`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f3ff;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(100, 101, 241, 0.1);">
    <div style="padding: 40px; text-align: center; background: linear-gradient(135deg, #6465f1 0%, #8b5cf6 100%);">
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">You're Invited!</h1>
    </div>
    <div style="padding: 40px;">
      <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
        <strong>${inviterName}</strong> has invited you to join <strong>${workspaceName}</strong> on Woozy Social.
      </p>
      <p style="margin: 0 0 30px 0; font-size: 16px; color: #374151;">
        Role: <strong style="color: #6465f1;">${inviteRole}</strong>
      </p>
      <div style="text-align: center;">
        <a href="${inviteLink}" style="display: inline-block; padding: 16px 32px; font-size: 16px; font-weight: 700; color: #ffffff; background: linear-gradient(135deg, #6465f1 0%, #8b5cf6 100%); text-decoration: none; border-radius: 8px;">
          Accept Invitation
        </a>
      </div>
      <p style="margin: 30px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.6; text-align: center;">
        This invitation expires in 7 days.
      </p>
    </div>
    <div style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
        If the button doesn't work, copy and paste this link:<br>
        <a href="${inviteLink}" style="color: #6465f1; word-break: break-all;">${inviteLink}</a>
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
