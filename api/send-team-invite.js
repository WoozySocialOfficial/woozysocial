const { Resend } = require("resend");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidEmail,
  isValidUUID,
  applyRateLimit,
  isServiceConfigured
} = require("./_utils");

const VALID_ROLES = ['admin', 'editor', 'view_only'];

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  // Rate limiting: 20 invites per minute per user
  const rateLimited = applyRateLimit(req, res, 'team-invite', { maxRequests: 20, windowMs: 60000 });
  if (rateLimited) return;

  const supabase = getSupabase();

  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { email, role, userId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['email', 'role', 'userId']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return sendError(res, "Invalid email format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate userId format
    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate role
    if (!VALID_ROLES.includes(role)) {
      return sendError(
        res,
        `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Check for existing team member
    const { data: existingMember, error: memberError } = await supabase
      .from('team_members')
      .select('id')
      .eq('owner_id', userId)
      .eq('email', email.toLowerCase())
      .single();

    if (memberError && memberError.code !== 'PGRST116') {
      logError('send-team-invite.checkMember', memberError, { userId });
      return sendError(res, "Failed to check existing members", ErrorCodes.DATABASE_ERROR);
    }

    if (existingMember) {
      return sendError(res, "This user is already a team member", ErrorCodes.VALIDATION_ERROR);
    }

    // Check for existing pending invitation
    const { data: existingInvite, error: inviteCheckError } = await supabase
      .from('team_invitations')
      .select('id, status')
      .eq('owner_id', userId)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .single();

    if (inviteCheckError && inviteCheckError.code !== 'PGRST116') {
      logError('send-team-invite.checkInvite', inviteCheckError, { userId });
    }

    if (existingInvite) {
      return sendError(
        res,
        "A pending invitation already exists for this email",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .insert({
        owner_id: userId,
        email: email.toLowerCase(),
        role: role,
        status: 'pending',
      })
      .select()
      .single();

    if (inviteError) {
      logError('send-team-invite.create', inviteError, { userId, email: email.toLowerCase() });
      return sendError(res, "Failed to create invitation", ErrorCodes.DATABASE_ERROR);
    }

    // Send email notification (non-blocking)
    if (isServiceConfigured('resend')) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        const inviterName = userData?.user?.email || 'A team member';
        const appUrl = process.env.APP_URL || 'https://woozysocial.com';
        const inviteLink = `${appUrl}/accept-invite?token=${invitation.invite_token}`;

        await resend.emails.send({
          from: 'Social Media Team <hello@woozysocial.com>',
          to: [email],
          subject: `${inviterName} invited you to join their team`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>You've been invited!</h2>
              <p>${inviterName} has invited you to join their team as ${role === 'view_only' ? 'a viewer' : `an ${role}`}.</p>
              <p style="margin: 24px 0;">
                <a href="${inviteLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                  Accept Invitation
                </a>
              </p>
              <p style="color: #666; font-size: 14px;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </div>
          `
        });
      } catch (emailError) {
        // Log but don't fail the request - invitation was created successfully
        logError('send-team-invite.email', emailError, { email: email.toLowerCase() });
      }
    }

    return sendSuccess(res, {
      message: 'Invitation sent successfully',
      invitationId: invitation.id,
      email: email.toLowerCase(),
      role: role
    });

  } catch (error) {
    logError('send-team-invite.handler', error, { method: req.method });
    return sendError(res, "Failed to send invitation", ErrorCodes.INTERNAL_ERROR);
  }
};
