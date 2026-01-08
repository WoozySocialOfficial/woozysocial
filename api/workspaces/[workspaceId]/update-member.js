const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../../_utils");

const VALID_ROLES = ['editor', 'admin', 'view_only'];

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
    const { workspaceId } = req.query;
    const { memberId, userId, role, permissions } = req.body;

    if (!memberId || !userId || !workspaceId) {
      return sendError(res, "memberId, userId, and workspaceId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(memberId)) {
      return sendError(res, "Invalid memberId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate role if provided
    if (role && !VALID_ROLES.includes(role)) {
      return sendError(
        res,
        `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Check if user has permission to update members
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role, can_manage_team')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      logError('workspaces.update-member.checkMembership', membershipError, { userId, workspaceId });
    }

    if (!membership) {
      return sendError(res, "You don't have access to this workspace", ErrorCodes.FORBIDDEN);
    }

    if (!membership.can_manage_team && membership.role !== 'owner') {
      return sendError(res, "You don't have permission to update members", ErrorCodes.FORBIDDEN);
    }

    // Cannot change your own role
    if (memberId === userId) {
      return sendError(res, "You cannot change your own role", ErrorCodes.VALIDATION_ERROR);
    }

    // Cannot change owner's role
    const { data: targetMember, error: targetError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId)
      .single();

    if (targetError && targetError.code !== 'PGRST116') {
      logError('workspaces.update-member.checkTarget', targetError, { memberId, workspaceId });
    }

    if (!targetMember) {
      return sendError(res, "Member not found in this workspace", ErrorCodes.NOT_FOUND);
    }

    if (targetMember.role === 'owner') {
      return sendError(res, "Cannot modify the workspace owner's role", ErrorCodes.VALIDATION_ERROR);
    }

    // Build update object
    const updateData = {};
    if (role) updateData.role = role;
    if (permissions) {
      if (typeof permissions.canManageTeam === 'boolean') updateData.can_manage_team = permissions.canManageTeam;
      if (typeof permissions.canManageSettings === 'boolean') updateData.can_manage_settings = permissions.canManageSettings;
      if (typeof permissions.canDeletePosts === 'boolean') updateData.can_delete_posts = permissions.canDeletePosts;
    }

    if (Object.keys(updateData).length === 0) {
      return sendError(res, "No updates provided", ErrorCodes.VALIDATION_ERROR);
    }

    // Update member
    const { error: updateError } = await supabase
      .from('workspace_members')
      .update(updateData)
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId);

    if (updateError) {
      logError('workspaces.update-member.update', updateError, { memberId, workspaceId });
      return sendError(res, "Failed to update member", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, { message: "Member updated successfully" });

  } catch (error) {
    logError('workspaces.update-member.handler', error);
    return sendError(res, "Failed to update member", ErrorCodes.INTERNAL_ERROR);
  }
};
