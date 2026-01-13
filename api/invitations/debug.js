/**
 * Debug endpoint to check invitation system
 * GET /api/invitations/debug?workspaceId=xxx
 */
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError
} = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { workspaceId, token } = req.query;

    const debugInfo = {
      timestamp: new Date().toISOString(),
      supabaseConnected: !!supabase,
      envVars: {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        APP_URL: process.env.APP_URL,
        RESEND_API_KEY: !!process.env.RESEND_API_KEY
      }
    };

    // If token provided, look it up
    if (token) {
      const { data: invitation, error: tokenError } = await supabase
        .from('workspace_invitations')
        .select('*')
        .eq('invite_token', token)
        .single();

      debugInfo.tokenLookup = {
        token: token.substring(0, 8) + '...',
        found: !!invitation,
        error: tokenError?.message,
        data: invitation ? {
          id: invitation.id,
          email: invitation.email,
          status: invitation.status,
          expires_at: invitation.expires_at,
          created_at: invitation.created_at
        } : null
      };
    }

    // If workspaceId provided, list all invitations
    if (workspaceId) {
      const { data: invitations, error: listError } = await supabase
        .from('workspace_invitations')
        .select('id, email, status, invite_token, created_at, expires_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(10);

      debugInfo.workspaceInvitations = {
        workspaceId,
        count: invitations?.length || 0,
        error: listError?.message,
        invitations: invitations?.map(inv => ({
          id: inv.id,
          email: inv.email,
          status: inv.status,
          token: inv.invite_token?.substring(0, 8) + '...',
          created: inv.created_at,
          expires: inv.expires_at
        }))
      };
    }

    // Test database connection
    try {
      const { data: testData, error: testError } = await supabase
        .from('workspace_invitations')
        .select('count')
        .limit(1);

      debugInfo.databaseTest = {
        canConnect: !testError,
        error: testError?.message
      };
    } catch (dbError) {
      debugInfo.databaseTest = {
        canConnect: false,
        error: dbError.message
      };
    }

    return sendSuccess(res, debugInfo);

  } catch (error) {
    console.error('invitations.debug error:', error);
    logError('invitations.debug.handler', error);
    return sendError(res, "Debug check failed", ErrorCodes.INTERNAL_ERROR, {
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
};
