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

const VALID_ROLES = ['admin', 'editor', 'view_only'];

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
    const { memberId, newRole, userId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['memberId', 'newRole', 'userId']);
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

    // Validate role
    if (!VALID_ROLES.includes(newRole)) {
      return sendError(
        res,
        `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Get the team member
    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, owner_id')
      .eq('id', memberId)
      .single();

    if (error || !member) {
      return sendError(res, "Team member not found", ErrorCodes.NOT_FOUND);
    }

    // Check authorization
    if (member.owner_id !== userId) {
      return sendError(res, "Only the team owner can change roles", ErrorCodes.FORBIDDEN);
    }

    const { error: updateError } = await supabase
      .from('team_members')
      .update({ role: newRole })
      .eq('id', memberId);

    if (updateError) {
      logError('team.update-role.update', updateError, { memberId, newRole });
      return sendError(res, "Failed to update role", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, {
      message: "Role updated successfully",
      newRole
    });
  } catch (error) {
    logError('team.update-role.handler', error);
    return sendError(res, "Failed to update role", ErrorCodes.INTERNAL_ERROR);
  }
};
