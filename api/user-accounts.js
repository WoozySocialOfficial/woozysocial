const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  getWorkspaceProfileKeyForUser,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  isServiceConfigured
} = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  try {
    const { userId, workspaceId } = req.query;

    if (workspaceId && !isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (userId && !isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get profile key - prefer workspaceId if provided, otherwise use userId fallback
    let profileKey;
    if (workspaceId) {
      profileKey = await getWorkspaceProfileKey(workspaceId);
    } else if (userId) {
      profileKey = await getWorkspaceProfileKeyForUser(userId);
    }

    if (!profileKey) {
      return sendSuccess(res, { accounts: [], activeSocialAccounts: [] });
    }

    if (!isServiceConfigured('ayrshare')) {
      return sendError(res, "Social media service is not configured", ErrorCodes.CONFIG_ERROR);
    }

    let response;
    try {
      response = await axios.get(`${BASE_AYRSHARE}/user`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        },
        timeout: 30000
      });
    } catch (axiosError) {
      logError('user-accounts.ayrshare', axiosError);

      // Return empty accounts on error rather than failing
      return sendSuccess(res, { accounts: [], activeSocialAccounts: [] });
    }

    const { displayNames } = response.data;

    if (!displayNames || !Array.isArray(displayNames)) {
      return sendSuccess(res, { accounts: [], activeSocialAccounts: [] });
    }

    const platformNames = displayNames.map((account) => account.platform);

    // Return both formats for compatibility with different components
    return sendSuccess(res, {
      accounts: platformNames,
      activeSocialAccounts: platformNames
    });

  } catch (error) {
    logError('user-accounts.handler', error);
    // Return empty accounts on error for graceful degradation
    return sendSuccess(res, { accounts: [], activeSocialAccounts: [] });
  }
};
