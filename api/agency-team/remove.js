/**
 * Remove member from agency team roster
 * POST /api/agency-team/remove
 */
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
const { getAgencyAccess } = require("../_utils-access-control");

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
    const { userId, teamMemberId } = req.body;

    const validation = validateRequired(req.body, ['userId', 'teamMemberId']);
    if (!validation.valid) {
      return sendError(res, `Missing required fields: ${validation.missing.join(', ')}`, ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId) || !isValidUUID(teamMemberId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    // Verify agency access (owner or delegated manager)
    const access = await getAgencyAccess(supabase, userId);

    if (!access.hasAccess) {
      return sendError(res, "Agency subscription required", ErrorCodes.SUBSCRIPTION_REQUIRED);
    }

    const agencyOwnerId = access.agencyOwnerId;

    // Verify the team member belongs to this agency
    const { data: member, error: memberError } = await supabase
      .from('agency_team_members')
      .select('id, agency_owner_id, email, member_user_id')
      .eq('id', teamMemberId)
      .single();

    if (memberError || !member) {
      return sendError(res, "Team member not found", ErrorCodes.NOT_FOUND);
    }

    if (member.agency_owner_id !== agencyOwnerId) {
      return sendError(res, "Not authorized to remove this team member", ErrorCodes.FORBIDDEN);
    }

    // Prevent delegated managers from removing themselves (would lock themselves out)
    if (access.isManager && member.member_user_id === userId) {
      return sendError(res, "You cannot remove yourself from the roster", ErrorCodes.FORBIDDEN);
    }

    // Delete from roster (cascade will handle provisions)
    const { error: deleteError } = await supabase
      .from('agency_team_members')
      .delete()
      .eq('id', teamMemberId);

    if (deleteError) {
      logError('agency-team.remove', deleteError);
      return sendError(res, "Failed to remove team member", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, {
      message: "Team member removed from roster",
      removedEmail: member.email
    });

  } catch (error) {
    logError('agency-team.remove.handler', error);
    return sendError(res, "Failed to remove team member", ErrorCodes.INTERNAL_ERROR);
  }
};
