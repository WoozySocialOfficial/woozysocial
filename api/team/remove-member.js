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
    const { memberId, userId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['memberId', 'userId']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(memberId) || !isValidUUID(userId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get the team member
    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, owner_id, member_id')
      .eq('id', memberId)
      .single();

    if (error || !member) {
      return sendError(res, "Team member not found", ErrorCodes.NOT_FOUND);
    }

    // Check authorization
    if (member.owner_id !== userId) {
      return sendError(res, "Only the team owner can remove members", ErrorCodes.FORBIDDEN);
    }

    // Prevent self-removal
    if (member.member_id === userId) {
      return sendError(res, "Cannot remove yourself from the team", ErrorCodes.VALIDATION_ERROR);
    }

    const { error: deleteError } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (deleteError) {
      logError('team.remove-member.delete', deleteError, { memberId });
      return sendError(res, "Failed to remove team member", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, { message: "Team member removed successfully" });
  } catch (error) {
    logError('team.remove-member.handler', error);
    return sendError(res, "Failed to remove team member", ErrorCodes.INTERNAL_ERROR);
  }
};
