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

    // Get all workspaces for this user
    const { data: memberships, error } = await supabase
      .from('workspace_members')
      .select(`
        role,
        workspace:workspaces(
          id,
          name,
          slug,
          logo_url,
          ayr_profile_key,
          created_at
        )
      `)
      .eq('user_id', userId);

    if (error) {
      logError('workspace.list.fetch', error, { userId });
      return sendError(res, "Failed to fetch workspaces", ErrorCodes.DATABASE_ERROR);
    }

    // Get user's last workspace preference
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('last_workspace_id')
      .eq('id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      logError('workspace.list.getProfile', profileError, { userId });
    }

    // Transform the data and deduplicate by workspace ID
    const seen = new Set();
    const workspaces = (memberships || [])
      .filter(m => m.workspace)
      .filter(m => {
        if (seen.has(m.workspace.id)) return false;
        seen.add(m.workspace.id);
        return true;
      })
      .map(m => ({
        ...m.workspace,
        membership: { role: m.role }
      }));

    return sendSuccess(res, {
      workspaces: workspaces,
      lastWorkspaceId: userProfile?.last_workspace_id || null
    });

  } catch (error) {
    logError('workspace.list.handler', error);
    return sendError(res, "Failed to list workspaces", ErrorCodes.INTERNAL_ERROR);
  }
};
