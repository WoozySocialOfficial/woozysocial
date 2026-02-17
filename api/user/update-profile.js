const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  parseBody
} = require("../_utils");

// Allowed fields that can be updated via this endpoint
const ALLOWED_FIELDS = [
  'app_tour_completed',
  'full_name',
  'avatar_url'
];

/**
 * POST /api/user/update-profile
 * Updates specific fields on the user's profile
 *
 * Body:
 * - userId: Required user ID
 * - updates: Object with fields to update (only whitelisted fields allowed)
 */
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
    return sendError(res, "Database not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const body = await parseBody(req);
    const { userId, updates } = body;

    if (!userId || !isValidUUID(userId)) {
      return sendError(res, "Valid userId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!updates || typeof updates !== 'object') {
      return sendError(res, "updates object is required", ErrorCodes.VALIDATION_ERROR);
    }

    // Filter to only allowed fields
    const safeUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED_FIELDS.includes(key)) {
        safeUpdates[key] = value;
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return sendError(res, "No valid fields to update", ErrorCodes.VALIDATION_ERROR);
    }

    const { error } = await supabase
      .from('user_profiles')
      .update(safeUpdates)
      .eq('id', userId);

    if (error) {
      logError('user.update-profile', error, { userId });
      return sendError(res, "Failed to update profile", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, { updated: Object.keys(safeUpdates) });

  } catch (error) {
    logError('user.update-profile.handler', error);
    return sendError(res, "Failed to update profile", ErrorCodes.INTERNAL_ERROR);
  }
};
