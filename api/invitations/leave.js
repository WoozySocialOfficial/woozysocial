/**
 * Leave a workspace (remove yourself as a member)
 * POST /api/invitations/leave
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

    const { workspaceId, userId } = body;

    if (!workspaceId || !userId) {
      return sendError(res, "workspaceId and userId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId) || !isValidUUID(userId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get user's membership
    const { data: membership, error: memberError } = await supabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (memberError || !membership) {
      return sendError(res, "You are not a member of this workspace", ErrorCodes.NOT_FOUND);
    }

    // Prevent owner from leaving
    if (membership.role === 'owner') {
      return sendError(
        res,
        "Workspace owners cannot leave. Please transfer ownership first or delete the workspace.",
        ErrorCodes.FORBIDDEN
      );
    }

    // Remove the member
    const { error: deleteError } = await supabase
      .from('workspace_members')
      .delete()
      .eq('id', membership.id);

    if (deleteError) {
      console.error('Failed to remove member:', deleteError);
      logError('invitations.leave.delete', deleteError);
      return sendError(res, "Failed to leave workspace", ErrorCodes.DATABASE_ERROR);
    }

    console.log('Member left workspace:', {
      userId,
      workspaceId,
      role: membership.role
    });

    return sendSuccess(res, {
      message: "Successfully left the workspace"
    });

  } catch (error) {
    console.error('invitations.leave error:', error);
    logError('invitations.leave.handler', error);
    return sendError(res, "Failed to leave workspace", ErrorCodes.INTERNAL_ERROR);
  }
};
