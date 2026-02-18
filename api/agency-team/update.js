/**
 * Update agency team member
 * POST /api/agency-team/update
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

const VALID_ROLES = ['admin', 'editor', 'view_only', 'client'];
const VALID_STATUSES = ['active', 'inactive'];

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
    const { userId, teamMemberId, fullName, defaultRole, department, notes, status, canManageAgency } = req.body;

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
      .select('id, agency_owner_id')
      .eq('id', teamMemberId)
      .single();

    if (memberError || !member) {
      return sendError(res, "Team member not found", ErrorCodes.NOT_FOUND);
    }

    if (member.agency_owner_id !== agencyOwnerId) {
      return sendError(res, "Not authorized to update this team member", ErrorCodes.FORBIDDEN);
    }

    // Build update object
    const updates = {};
    if (fullName !== undefined) updates.full_name = fullName?.trim() || null;
    if (defaultRole && VALID_ROLES.includes(defaultRole)) updates.default_role = defaultRole;
    if (department !== undefined) updates.department = department?.trim() || null;
    if (notes !== undefined) updates.notes = notes?.trim() || null;
    if (status && VALID_STATUSES.includes(status)) updates.status = status;

    // can_manage_agency toggle — only the agency owner can change this
    if (typeof canManageAgency === 'boolean') {
      if (!access.isOwner) {
        return sendError(res, "Only the agency owner can grant or revoke agency management permission", ErrorCodes.FORBIDDEN);
      }
      updates.can_manage_agency = canManageAgency;
    }

    if (Object.keys(updates).length === 0) {
      return sendError(res, "No valid fields to update", ErrorCodes.VALIDATION_ERROR);
    }

    const { data: updated, error: updateError } = await supabase
      .from('agency_team_members')
      .update(updates)
      .eq('id', teamMemberId)
      .select()
      .single();

    if (updateError) {
      logError('agency-team.update', updateError);
      return sendError(res, "Failed to update team member", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, { teamMember: updated });

  } catch (error) {
    logError('agency-team.update.handler', error);
    return sendError(res, "Failed to update team member", ErrorCodes.INTERNAL_ERROR);
  }
};
