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

    const { data: invites, error } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('owner_id', userId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false });

    if (error) {
      logError('team.pending-invites.fetch', error, { userId });
      return sendError(res, "Failed to fetch pending invites", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, { invites: invites || [] });
  } catch (error) {
    logError('team.pending-invites.handler', error);
    return sendError(res, "Failed to fetch pending invites", ErrorCodes.INTERNAL_ERROR);
  }
};
