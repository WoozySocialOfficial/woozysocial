/**
 * Add member to agency team roster
 * POST /api/agency-team/add
 */
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidUUID,
  isValidEmail
} = require("../_utils");
const { getAgencyAccess } = require("../_utils-access-control");

const VALID_ROLES = ['admin', 'editor', 'view_only', 'client'];

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
    const { userId, email, fullName, defaultRole, department, notes } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['userId', 'email']);
    if (!validation.valid) {
      return sendError(res, `Missing required fields: ${validation.missing.join(', ')}`, ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidEmail(email)) {
      return sendError(res, "Invalid email format", ErrorCodes.VALIDATION_ERROR);
    }

    const role = defaultRole && VALID_ROLES.includes(defaultRole) ? defaultRole : 'editor';

    // Verify agency access (owner or delegated manager)
    const access = await getAgencyAccess(supabase, userId);

    if (!access.hasAccess) {
      return sendError(res, "Agency subscription required", ErrorCodes.SUBSCRIPTION_REQUIRED);
    }

    const agencyOwnerId = access.agencyOwnerId;

    // Check if member already exists in roster
    const { data: existing } = await supabase
      .from('agency_team_members')
      .select('id')
      .eq('agency_owner_id', agencyOwnerId)
      .ilike('email', email.trim())
      .single();

    if (existing) {
      return sendError(res, "Team member already exists in roster", ErrorCodes.VALIDATION_ERROR);
    }

    // Check if email belongs to an existing user
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .ilike('email', email.trim())
      .single();

    // Add to roster
    const { data: newMember, error: insertError } = await supabase
      .from('agency_team_members')
      .insert({
        agency_owner_id: agencyOwnerId,
        email: email.toLowerCase().trim(),
        member_user_id: existingUser?.id || null,
        full_name: fullName?.trim() || existingUser?.full_name || null,
        default_role: role,
        department: department?.trim() || null,
        notes: notes?.trim() || null,
        status: existingUser ? 'active' : 'pending'
      })
      .select()
      .single();

    if (insertError) {
      logError('agency-team.add.insert', insertError);
      return sendError(res, "Failed to add team member", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, {
      teamMember: {
        ...newMember,
        isRegistered: !!existingUser,
        profile: existingUser ? { id: existingUser.id, full_name: existingUser.full_name } : null
      }
    });

  } catch (error) {
    logError('agency-team.add.handler', error);
    return sendError(res, "Failed to add team member", ErrorCodes.INTERNAL_ERROR);
  }
};
