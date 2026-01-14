const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError
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
    const { userId, workspaceId } = req.query;

    if (!userId) {
      return sendError(res, "userId is required", ErrorCodes.VALIDATION_ERROR);
    }

    console.log('[notifications.debug] Testing notification query for userId:', userId, 'workspaceId:', workspaceId);

    // Test 1: Direct query using service role (should work)
    let query1 = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (workspaceId) {
      query1 = query1.eq('workspace_id', workspaceId);
    }

    const { data: serviceRoleResults, error: serviceRoleError } = await query1;

    console.log('[notifications.debug] Service role query results:', {
      count: serviceRoleResults?.length || 0,
      error: serviceRoleError,
      sampleIds: serviceRoleResults?.map(n => n.id).slice(0, 3)
    });

    // Test 2: Check if user exists in auth.users
    const { data: authUser, error: authError } = await supabase
      .from('auth.users')
      .select('id, email')
      .eq('id', userId)
      .single();

    console.log('[notifications.debug] Auth user check:', {
      found: !!authUser,
      error: authError
    });

    // Test 3: Check workspace membership
    if (workspaceId) {
      const { data: membership, error: membershipError } = await supabase
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single();

      console.log('[notifications.debug] Workspace membership:', {
        found: !!membership,
        role: membership?.role,
        error: membershipError
      });
    }

    return sendSuccess(res, {
      userId,
      workspaceId,
      serviceRoleQuery: {
        count: serviceRoleResults?.length || 0,
        error: serviceRoleError?.message || null,
        sample: serviceRoleResults?.slice(0, 2) || []
      },
      authUser: {
        exists: !!authUser,
        email: authUser?.email || null
      },
      rlsNote: "This endpoint uses service role key which bypasses RLS. Frontend uses anon key which enforces RLS."
    });

  } catch (error) {
    logError('notifications.debug.handler', error);
    return sendError(res, "Debug check failed", ErrorCodes.INTERNAL_ERROR);
  }
};
