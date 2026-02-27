const axios = require("axios");
let kv;
try {
  kv = require("@vercel/kv").kv;
} catch (e) {
  // KV not available in development
  kv = null;
}
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
const AYRSHARE_CACHE_TTL = 60; // Cache user accounts for 1 minute (invalidated on connect)

module.exports = async function handler(req, res) {
  setCors(res, req);

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

    // Get profile key - prefer workspaceId if provided, otherwise use userId fallback, then env fallback
    let profileKey;
    if (workspaceId) {
      profileKey = await getWorkspaceProfileKey(workspaceId);
    } else if (userId) {
      profileKey = await getWorkspaceProfileKeyForUser(userId);
    }
    // Fallback to environment variable (consistent with generate-jwt.js and post.js)
    if (!profileKey && process.env.AYRSHARE_PROFILE_KEY) {
      profileKey = process.env.AYRSHARE_PROFILE_KEY;
    }

    if (!profileKey) {
      return sendSuccess(res, { accounts: [], activeSocialAccounts: [] });
    }

    if (!isServiceConfigured('ayrshare')) {
      return sendError(res, "Social media service is not configured", ErrorCodes.CONFIG_ERROR);
    }

    // Try cache first
    const cacheKey = `ayrshare:user:${profileKey}`;
    let displayNames = null;

    if (kv) {
      try {
        const cached = await kv.get(cacheKey);
        if (cached) {
          displayNames = cached;
        }
      } catch (cacheErr) {
        // Cache miss or error, continue to fetch
      }
    }

    // If not in cache, fetch from Ayrshare
    if (!displayNames) {
      try {
        const response = await axios.get(`${BASE_AYRSHARE}/user`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey
          },
          timeout: 30000
        });
        displayNames = response.data.displayNames;

        // Cache the response
        if (kv && displayNames && Array.isArray(displayNames)) {
          try {
            await kv.set(cacheKey, displayNames, { ex: AYRSHARE_CACHE_TTL });
          } catch (setCacheErr) {
            // Ignore cache set errors
          }
        }
      } catch (axiosError) {
        logError('user-accounts.ayrshare', axiosError);
        // Return empty accounts on error rather than failing
        return sendSuccess(res, { accounts: [], activeSocialAccounts: [] });
      }
    }

    if (!displayNames || !Array.isArray(displayNames)) {
      return sendSuccess(res, { accounts: [], activeSocialAccounts: [] });
    }

    const platformNames = displayNames.map((account) => account.platform);

    // Return full account data for preview components
    const accountDetails = displayNames.map((account) => ({
      platform: account.platform,
      username: account.displayName || account.username || account.platform,
      profilePicture: account.userImage || account.profilePicture || null
    }));

    // Return both formats for compatibility with different components
    return sendSuccess(res, {
      accounts: platformNames,
      activeSocialAccounts: platformNames,
      accountDetails: accountDetails
    });

  } catch (error) {
    logError('user-accounts.handler', error);
    // Return empty accounts on error for graceful degradation
    return sendSuccess(res, { accounts: [], activeSocialAccounts: [] });
  }
};
