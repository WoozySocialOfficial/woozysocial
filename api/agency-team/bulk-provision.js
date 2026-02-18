/**
 * Bulk provision team members to a workspace
 * POST /api/agency-team/bulk-provision
 */
const { Resend } = require("resend");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidUUID,
  isServiceConfigured
} = require("../_utils");
const { getAgencyAccess } = require("../_utils-access-control");

// Role-based permissions (same as invitations/accept.js)
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
    const { userId, workspaceId, teamMemberIds, roleOverrides } = req.body;

    const validation = validateRequired(req.body, ['userId', 'workspaceId', 'teamMemberIds']);
    if (!validation.valid) {
      return sendError(res, `Missing required fields: ${validation.missing.join(', ')}`, ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId) || !isValidUUID(workspaceId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!Array.isArray(teamMemberIds) || teamMemberIds.length === 0) {
      return sendError(res, "teamMemberIds must be a non-empty array", ErrorCodes.VALIDATION_ERROR);
    }

    // Verify agency access (owner or delegated manager)
    const access = await getAgencyAccess(supabase, userId);

    if (!access.hasAccess) {
      return sendError(res, "Agency subscription required", ErrorCodes.SUBSCRIPTION_REQUIRED);
    }

    const agencyOwnerId = access.agencyOwnerId;

    // Get the acting user's profile for email invitations
    const { data: actingUserProfile } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    // Verify workspace ownership (must be owned by the agency owner)
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name, owner_id')
      .eq('id', workspaceId)
      .single();

    if (!workspace) {
      return sendError(res, "Workspace not found", ErrorCodes.NOT_FOUND);
    }

    if (workspace.owner_id !== agencyOwnerId) {
      return sendError(res, "Workspace must be owned by the agency owner to provision team members", ErrorCodes.FORBIDDEN);
    }

    // Fetch selected team members from the agency owner's roster
    const { data: teamMembers, error: fetchError } = await supabase
      .from('agency_team_members')
      .select('*')
      .eq('agency_owner_id', agencyOwnerId)
      .in('id', teamMemberIds);

    if (fetchError) {
      logError('agency-team.bulk-provision.fetch', fetchError);
      return sendError(res, "Failed to fetch team members", ErrorCodes.DATABASE_ERROR);
    }

    if (!teamMembers || teamMembers.length === 0) {
      return sendError(res, "No valid team members found", ErrorCodes.NOT_FOUND);
    }

    // Get existing workspace members to check for duplicates
    const { data: existingMembers } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);

    const existingUserIds = new Set((existingMembers || []).map(m => m.user_id));

    // Get existing invitations to check for duplicates
    const { data: existingInvites } = await supabase
      .from('workspace_invitations')
      .select('email, status')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending');

    const existingInviteEmails = new Set((existingInvites || []).map(i => i.email.toLowerCase()));

    // Process each team member
    const results = {
      directAdded: [],
      invitationsSent: [],
      skipped: [],
      errors: []
    };

    const roleOverridesMap = roleOverrides || {};

    // Setup Resend for emails
    let resend = null;
    if (isServiceConfigured('resend')) {
      resend = new Resend(process.env.RESEND_API_KEY);
    }

    const appUrl = (process.env.APP_URL || 'https://woozysocials.com').trim();
    const inviterName = actingUserProfile?.full_name || actingUserProfile?.email || 'Agency team';

    for (const member of teamMembers) {
      try {
        const effectiveRole = roleOverridesMap[member.id] || member.default_role;
        const permissions = ROLE_PERMISSIONS[effectiveRole] || ROLE_PERMISSIONS.editor;

        // Check if already a member
        if (member.member_user_id && existingUserIds.has(member.member_user_id)) {
          results.skipped.push({ email: member.email, reason: 'Already a workspace member' });
          continue;
        }

        // Check if already has pending invitation
        if (existingInviteEmails.has(member.email.toLowerCase())) {
          results.skipped.push({ email: member.email, reason: 'Pending invitation exists' });
          continue;
        }

        if (member.member_user_id) {
          // Registered user - add directly to workspace
          const { data: newMember, error: addError } = await supabase
            .from('workspace_members')
            .insert({
              workspace_id: workspaceId,
              user_id: member.member_user_id,
              role: effectiveRole,
              can_manage_team: permissions.can_manage_team,
              can_manage_settings: permissions.can_manage_settings,
              can_delete_posts: permissions.can_delete_posts,
              can_approve_posts: permissions.can_approve_posts
            })
            .select()
            .single();

          if (addError) {
            results.errors.push({ email: member.email, error: addError.message });
            continue;
          }

          // Record provision
          await supabase.from('agency_workspace_provisions').insert({
            agency_owner_id: agencyOwnerId,
            workspace_id: workspaceId,
            agency_team_member_id: member.id,
            provisioned_role: effectiveRole,
            provision_type: 'direct',
            workspace_member_id: newMember.id,
            status: 'completed'
          });

          // Add to existing set to prevent duplicates in same batch
          existingUserIds.add(member.member_user_id);

          results.directAdded.push({
            email: member.email,
            name: member.full_name,
            role: effectiveRole
          });

        } else {
          // Unregistered user - create invitation
          const { data: invitation, error: inviteError } = await supabase
            .from('workspace_invitations')
            .insert({
              workspace_id: workspaceId,
              email: member.email.toLowerCase(),
              role: effectiveRole,
              invited_by: userId,
              status: 'pending'
            })
            .select()
            .single();

          if (inviteError) {
            results.errors.push({ email: member.email, error: inviteError.message });
            continue;
          }

          // Record provision
          await supabase.from('agency_workspace_provisions').insert({
            agency_owner_id: agencyOwnerId,
            workspace_id: workspaceId,
            agency_team_member_id: member.id,
            provisioned_role: effectiveRole,
            provision_type: 'invitation',
            invitation_id: invitation.id,
            status: 'pending'
          });

          // Add to existing set to prevent duplicates in same batch
          existingInviteEmails.add(member.email.toLowerCase());

          // Send invitation email
          if (resend) {
            const inviteLink = `${appUrl}/accept-invite?token=${invitation.invite_token}`;

            try {
              await resend.emails.send({
                from: 'Woozy Social <hello@woozysocials.com>',
                to: [member.email],
                subject: `${inviterName} invited you to join ${workspace.name}`,
                html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f3ff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px;">
          <tr>
            <td align="center" style="padding: 30px 40px;">
              <h1 style="margin: 0; color: #6465f1; font-size: 28px; font-weight: 700;">You're Invited!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 40px 40px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                <strong>${inviterName}</strong> has invited you to join <strong>${workspace.name}</strong> on Woozy Social.
              </p>
              <p style="margin: 0 0 30px 0; font-size: 16px; color: #374151;">
                Role: <strong style="color: #6465f1;">${effectiveRole}</strong>
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td align="center">
                    <a href="${inviteLink}" target="_blank" style="display: inline-block; padding: 14px 30px; font-size: 16px; font-weight: 700; color: #6465f1; text-decoration: none; border: 2px solid #6465f1; border-radius: 8px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.6; text-align: center;">
                This invitation expires in 7 days.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
                If the button doesn't work, copy and paste this link:<br>
                <a href="${inviteLink}" style="color: #6465f1; word-break: break-all;">${inviteLink}</a>
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
              logError('agency-team.bulk-provision.email', emailError);
              // Don't fail the provision if email fails
            }
          }

          results.invitationsSent.push({
            email: member.email,
            name: member.full_name,
            role: effectiveRole
          });
        }

      } catch (memberError) {
        results.errors.push({ email: member.email, error: memberError.message });
      }
    }

    return sendSuccess(res, {
      workspaceId,
      workspaceName: workspace.name,
      ...results,
      summary: {
        total: teamMembers.length,
        directAdded: results.directAdded.length,
        invitationsSent: results.invitationsSent.length,
        skipped: results.skipped.length,
        errors: results.errors.length
      }
    });

  } catch (error) {
    logError('agency-team.bulk-provision.handler', error);
    return sendError(res, "Failed to provision team members", ErrorCodes.INTERNAL_ERROR);
  }
};
