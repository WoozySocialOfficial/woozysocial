const { Resend } = require("resend");
const { setCors, getSupabase } = require("../../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { workspaceId } = req.query;
    const { email, role, userId } = req.body;
    const supabase = getSupabase();
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

    if (!supabase) {
      return res.status(500).json({ error: "Database not configured" });
    }

    if (!email || !userId || !workspaceId) {
      return res.status(400).json({ error: "Email, userId, and workspaceId are required" });
    }

    // Check if user has permission to invite (must be owner or admin of workspace)
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role, can_manage_team')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({ error: "You don't have access to this workspace" });
    }

    if (!membership.can_manage_team && membership.role !== 'owner') {
      return res.status(403).json({ error: "You don't have permission to invite members" });
    }

    // Check if user already exists and is a member
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      const { data: existingMember } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', existingUser.id)
        .single();

      if (existingMember) {
        return res.status(400).json({ error: 'This user is already a workspace member' });
      }
    }

    // Check if there's already a pending invitation
    const { data: existingInvite } = await supabase
      .from('workspace_invitations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .single();

    if (existingInvite) {
      return res.status(400).json({ error: 'An invitation has already been sent to this email' });
    }

    // Create the invitation (invite_token auto-generated as UUID by database)
    const { data: invitation, error: inviteError } = await supabase
      .from('workspace_invitations')
      .insert({
        workspace_id: workspaceId,
        email: email.toLowerCase(),
        role: role || 'editor',
        invited_by: userId,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Invitation error:', inviteError);
      return res.status(500).json({ error: 'Failed to create invitation', details: inviteError.message });
    }

    // Get workspace name for the email
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single();

    // Send email if Resend is configured
    if (resend) {
      const { data: inviterData } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', userId)
        .single();

      const inviterName = inviterData?.full_name || inviterData?.email || 'A team member';
      const workspaceName = workspace?.name || 'a workspace';
      const appUrl = process.env.APP_URL || 'https://woozysocial.com';
      const inviteLink = `${appUrl}/accept-invite?token=${invitation.invite_token}`;

      try {
        await resend.emails.send({
          from: 'Woozy Social <hello@woozysocial.com>',
          to: [email],
          subject: `${inviterName} invited you to join ${workspaceName} on Woozy Social`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>You've been invited!</h2>
              <p>${inviterName} has invited you to join <strong>${workspaceName}</strong> on Woozy Social.</p>
              <p>Role: <strong>${role || 'editor'}</strong></p>
              <p style="margin: 30px 0;">
                <a href="${inviteLink}" style="background-color: #FFC801; color: #114C5A; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Accept Invitation
                </a>
              </p>
              <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
            </div>
          `
        });
      } catch (emailError) {
        console.error('Email error:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.status(200).json({ success: true, invitation });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to send invitation", details: error.message });
  }
};
