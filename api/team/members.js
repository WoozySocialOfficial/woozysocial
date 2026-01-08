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

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();

  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { userId } = req.query;

    if (!userId) {
      return sendError(res, "userId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    const { data: members, error } = await supabase
      .from('team_members')
      .select('id, owner_id, member_id, role, created_at, joined_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logError('team.members.fetch', error, { userId });
      return sendError(res, "Failed to fetch team members", ErrorCodes.DATABASE_ERROR);
    }

    const memberIds = (members || []).map((m) => m.member_id);
    let profilesById = {};

    if (memberIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, email, full_name')
        .in('id', memberIds);

      if (profileError) {
        logError('team.members.profiles', profileError, { userId });
      }

      profilesById = (profiles || []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});
    }

    const enrichedMembers = (members || []).map((m) => ({
      ...m,
      profile: profilesById[m.member_id] || null,
    }));

    return sendSuccess(res, { members: enrichedMembers });
  } catch (error) {
    logError('team.members.handler', error);
    return sendError(res, "Failed to fetch team members", ErrorCodes.INTERNAL_ERROR);
  }
};
