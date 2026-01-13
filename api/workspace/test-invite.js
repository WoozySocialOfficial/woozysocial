// Test endpoint to verify invitation system
const {
  setCors,
  getSupabase,
  sendSuccess,
  sendError,
  logError
} = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabase = getSupabase();

  if (!supabase) {
    return sendError(res, "Database service is not available");
  }

  try {
    const { token } = req.query;

    // Get environment info
    const envInfo = {
      FRONTEND_URL: process.env.FRONTEND_URL || 'not set',
      APP_URL: process.env.APP_URL || 'not set',
      NODE_ENV: process.env.NODE_ENV || 'not set',
      VERCEL_ENV: process.env.VERCEL_ENV || 'not set'
    };

    if (!token) {
      return sendSuccess(res, {
        message: "Test endpoint working",
        environment: envInfo,
        usage: "Add ?token=YOUR_TOKEN to test a specific invitation"
      });
    }

    // Test looking up the invitation
    const { data: invitation, error } = await supabase
      .from('workspace_invitations')
      .select(`
        id,
        email,
        status,
        invited_at,
        expires_at,
        invite_token,
        workspace_id,
        workspaces (
          id,
          name
        )
      `)
      .eq('invite_token', token)
      .single();

    return sendSuccess(res, {
      environment: envInfo,
      token: {
        provided: token.substring(0, 8) + '...',
        length: token.length
      },
      invitation: invitation ? {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        workspace: invitation.workspaces?.name,
        invited_at: invitation.invited_at,
        expires_at: invitation.expires_at,
        expired: new Date(invitation.expires_at) < new Date(),
        token_matches: invitation.invite_token === token
      } : null,
      error: error ? {
        code: error.code,
        message: error.message
      } : null
    });

  } catch (error) {
    logError('workspace.test-invite', error);
    return sendError(res, error.message);
  }
};
