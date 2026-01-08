const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  applyRateLimit
} = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  // Rate limiting: 5 logout-all attempts per hour
  const rateLimited = applyRateLimit(req, res, 'logout-all', { maxRequests: 5, windowMs: 3600000 });
  if (rateLimited) return;

  const supabase = getSupabase();

  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return sendError(res, "userId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError) {
      logError('auth.logout-all.getUser', userError, { userId });
    }

    if (userError || !user) {
      return sendError(res, "User not found", ErrorCodes.NOT_FOUND);
    }

    // Sign out user from all sessions by updating their auth metadata
    // This invalidates all existing tokens
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...user.user?.app_metadata,
        sessions_invalidated_at: new Date().toISOString()
      }
    });

    if (updateError) {
      logError('auth.logout-all.invalidateSessions', updateError, { userId });
      return sendError(res, "Failed to logout from all devices", ErrorCodes.INTERNAL_ERROR);
    }

    return sendSuccess(res, {
      message: "Logged out from all devices successfully"
    });

  } catch (error) {
    logError('auth.logout-all.handler', error);
    return sendError(res, "Failed to logout from all devices", ErrorCodes.INTERNAL_ERROR);
  }
};
