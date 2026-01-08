const axios = require("axios");
const {
  setCors,
  getSupabase,
  getWorkspaceProfileKey,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidUUID,
  isServiceConfigured
} = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

const VALID_PLATFORMS = [
  'facebook', 'instagram', 'twitter', 'linkedin',
  'youtube', 'tiktok', 'pinterest', 'reddit', 'telegram'
];

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
    const { platform, userId, workspaceId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['platform', 'userId']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (workspaceId && !isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate platform
    if (!VALID_PLATFORMS.includes(platform.toLowerCase())) {
      return sendError(
        res,
        `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isServiceConfigured('ayrshare')) {
      return sendError(res, "Social media service is not configured", ErrorCodes.CONFIG_ERROR);
    }

    // Get the profile key for the workspace or user
    let profileKey = null;
    if (workspaceId) {
      profileKey = await getWorkspaceProfileKey(workspaceId);
    }

    if (!profileKey) {
      // Fall back to user's profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('ayr_profile_key')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        logError('social.disconnect.getProfile', profileError, { userId });
      }

      profileKey = profile?.ayr_profile_key;
    }

    if (!profileKey) {
      return sendError(res, "No social media profile found", ErrorCodes.VALIDATION_ERROR);
    }

    // Call Ayrshare API to unlink the social account
    let response;
    try {
      response = await axios.delete(`${BASE_AYRSHARE}/profiles/social/${platform.toLowerCase()}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        },
        timeout: 30000
      });
    } catch (axiosError) {
      logError('social.disconnect.ayrshare', axiosError, { platform, userId });
      return sendError(
        res,
        "Failed to disconnect social account",
        ErrorCodes.EXTERNAL_API_ERROR,
        axiosError.response?.data
      );
    }

    if (response.data.status === "success" || response.status === 200) {
      return sendSuccess(res, {
        message: `${platform} disconnected successfully`
      });
    } else {
      return sendError(
        res,
        "Failed to disconnect platform",
        ErrorCodes.EXTERNAL_API_ERROR,
        response.data
      );
    }

  } catch (error) {
    logError('social.disconnect.handler', error);
    return sendError(res, "Failed to disconnect social account", ErrorCodes.INTERNAL_ERROR);
  }
};
