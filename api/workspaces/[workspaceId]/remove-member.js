const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../../_utils");

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
    const { memberId, userId } = req.body;

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

    // Check if user has permission to remove members
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role, can_manage_team')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      logError('workspaces.remove-member.checkMembership', membershipError, { userId, workspaceId });
    }

    if (!membership) {
      return sendError(res, "You don't have access to this workspace", ErrorCodes.FORBIDDEN);
    }

    if (!membership.can_manage_team && membership.role !== 'owner') {
      return sendError(res, "You don't have permission to remove members", ErrorCodes.FORBIDDEN);
    }

    // Cannot remove yourself
    if (memberId === userId) {
      return sendError(res, "You cannot remove yourself from the workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Check if target is an owner (cannot remove owners)
    const { data: targetMember, error: targetError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId)
      .single();

    if (targetError && targetError.code !== 'PGRST116') {
      logError('workspaces.remove-member.checkTarget', targetError, { memberId, workspaceId });
    }

    if (!targetMember) {
      return sendError(res, "Member not found in this workspace", ErrorCodes.NOT_FOUND);
    }

    if (targetMember.role === 'owner') {
      return sendError(res, "Cannot remove the workspace owner", ErrorCodes.VALIDATION_ERROR);
    }

    // Remove member
    const { error: deleteError } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId);

    if (deleteError) {
      logError('workspaces.remove-member.delete', deleteError, { memberId, workspaceId });
      return sendError(res, "Failed to remove member", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, { message: "Member removed successfully" });

  } catch (error) {
    logError('workspaces.remove-member.handler', error);
    return sendError(res, "Failed to remove member", ErrorCodes.INTERNAL_ERROR);
  }
};
