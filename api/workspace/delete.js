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
    const { userId, workspaceId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['userId', 'workspaceId']);
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

    // Check if user is owner of this workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .limit(1);

    if (membershipError) {
      logError('workspace.delete.checkMembership', membershipError, { userId, workspaceId });
      return sendError(res, "Failed to verify permissions", ErrorCodes.DATABASE_ERROR);
    }

    if (!membership || membership.length === 0) {
      return sendError(res, "You do not have access to this workspace", ErrorCodes.FORBIDDEN);
    }

    if (membership[0].role !== 'owner') {
      return sendError(res, "Only the owner can delete the workspace", ErrorCodes.FORBIDDEN);
    }

    // Check how many workspaces the user owns
    const { data: userWorkspaces, error: countError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('role', 'owner');

    if (countError) {
      logError('workspace.delete.countWorkspaces', countError, { userId });
      return sendError(res, "Failed to verify workspace count", ErrorCodes.DATABASE_ERROR);
    }

    if (userWorkspaces && userWorkspaces.length <= 1) {
      return sendError(res, "Cannot delete your only workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Delete workspace members first (foreign key constraint)
    const { error: membersDeleteError } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId);

    if (membersDeleteError) {
      logError('workspace.delete.members', membersDeleteError, { workspaceId });
    }

    // Delete workspace invitations
    const { error: invitesDeleteError } = await supabase
      .from('workspace_invitations')
      .delete()
      .eq('workspace_id', workspaceId);

    if (invitesDeleteError) {
      logError('workspace.delete.invitations', invitesDeleteError, { workspaceId });
    }

    // Delete post drafts for this workspace
    const { error: draftsDeleteError } = await supabase
      .from('post_drafts')
      .delete()
      .eq('workspace_id', workspaceId);

    if (draftsDeleteError) {
      logError('workspace.delete.drafts', draftsDeleteError, { workspaceId });
    }

    // Delete brand profiles for this workspace
    const { error: brandDeleteError } = await supabase
      .from('brand_profiles')
      .delete()
      .eq('workspace_id', workspaceId);

    if (brandDeleteError) {
      logError('workspace.delete.brandProfiles', brandDeleteError, { workspaceId });
    }

    // Delete the workspace
    const { error: deleteError } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', workspaceId);

    if (deleteError) {
      logError('workspace.delete.workspace', deleteError, { workspaceId });
      return sendError(res, "Failed to delete workspace", ErrorCodes.DATABASE_ERROR);
    }

    // Update user's last_workspace_id if it was this workspace
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('last_workspace_id')
      .eq('id', userId)
      .single();

    if (userProfile?.last_workspace_id === workspaceId) {
      // Find another workspace to set as active
      const { data: remainingWorkspaces } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .limit(1);

      const newActiveId = remainingWorkspaces?.[0]?.workspace_id || null;

      await supabase
        .from('user_profiles')
        .update({ last_workspace_id: newActiveId })
        .eq('id', userId);
    }

    return sendSuccess(res, { message: "Workspace deleted successfully" });

  } catch (error) {
    logError('workspace.delete.handler', error);
    return sendError(res, "Failed to delete workspace", ErrorCodes.INTERNAL_ERROR);
  }
};
