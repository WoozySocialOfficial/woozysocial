const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
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
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { userId, workspaceId, newName } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['userId', 'workspaceId', 'newName']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(userId) || !isValidUUID(workspaceId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate name length
    if (newName.length < 2 || newName.length > 100) {
      return sendError(res, "Workspace name must be between 2 and 100 characters", ErrorCodes.VALIDATION_ERROR);
    }

    // Check if user is owner of this workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .limit(1);

    if (membershipError) {
      logError('workspace.rename.checkMembership', membershipError, { userId, workspaceId });
      return sendError(res, "Failed to verify permissions", ErrorCodes.DATABASE_ERROR);
    }

    if (!membership || membership.length === 0) {
      return sendError(res, "You do not have access to this workspace", ErrorCodes.FORBIDDEN);
    }

    if (membership[0].role !== 'owner') {
      return sendError(res, "Only the owner can rename the workspace", ErrorCodes.FORBIDDEN);
    }

    // Update workspace name
    const { data: workspace, error: updateError } = await supabase
      .from('workspaces')
      .update({ name: newName })
      .eq('id', workspaceId)
      .select()
      .single();

    if (updateError) {
      logError('workspace.rename.update', updateError, { workspaceId, newName });
      return sendError(res, "Failed to rename workspace", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug
      }
    });

  } catch (error) {
    logError('workspace.rename.handler', error);
    return sendError(res, "Failed to rename workspace", ErrorCodes.INTERNAL_ERROR);
  }
};
