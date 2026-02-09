/**
 * ⚠️ CRITICAL ENDPOINT - DO NOT MODIFY WITHOUT TESTING ⚠️
 *
 * This endpoint is ESSENTIAL for social account connections.
 * The entire application depends on this working correctly.
 *
 * Response format: { success: true, data: { url: "..." } }
 *
 * Frontend components that depend on this:
 * - SocialAccounts.jsx
 * - TopHeader.jsx
 * - DashboardContent.jsx
 * - RightSideNav.jsx
 *
 * See CRITICAL_FEATURES.md for testing checklist before deploying changes.
 */
const axios = require("axios");
const {
  getWorkspaceProfileKey,
  getUserProfileKey,
  requireActiveProfile,
  sendSuccess,
  sendError,
  ErrorCodes,
  logError,
  setCors
} = require("./_utils");

const BASE_AYRSHARE = "https://app.ayrshare.com/api";

/**
 * Process private key - handles both file paths (dev) and raw content (production)
 * In Vercel, the private key will be stored directly in environment variable
 */
const readPrivateKey = async (privateKeyPathOrContent) => {
  try {
    if (!privateKeyPathOrContent) {
      console.error("[readPrivateKey] No private key path or content provided!");
      throw new Error("Private key not configured");
    }

    let privateKey = privateKeyPathOrContent;

    // In Vercel deployment, it's always the raw content
    console.log(`[readPrivateKey] Using private key content, length: ${privateKeyPathOrContent.length}`);

    // Replace literal \n with actual newlines if they exist
    privateKey = privateKey.replace(/\\n/g, '\n');
    // Only trim trailing/leading whitespace, preserve internal newlines
    privateKey = privateKey.replace(/^\s+|\s+$/g, '');

    // Validate the key looks correct
    if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
      console.error("[readPrivateKey] Private key appears malformed - missing BEGIN/END markers");
      console.error("[readPrivateKey] Key preview:", privateKey.substring(0, 100));
    }

    return privateKey;
  } catch (error) {
    console.error("[readPrivateKey] Error reading private key:", error);
    throw new Error("Failed to read private key");
  }
};

/**
 * Generate JWT URL for Ayrshare social account connection
 * GET /api/generate-jwt?workspaceId=xxx&userId=xxx
 */
module.exports = async (req, res) => {
  // Set CORS headers first
  setCors(res, req);

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apply authentication middleware
  return requireActiveProfile(req, res, async () => {
    try {
      const { userId, workspaceId } = req.query;
      console.log(`[generate-jwt] Called with userId: ${userId}, workspaceId: ${workspaceId}`);

      // Get environment variables
      const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;
      const AYRSHARE_DOMAIN = process.env.AYRSHARE_DOMAIN;
      const AYRSHARE_PRIVATE_KEY = process.env.AYRSHARE_PRIVATE_KEY;
      const AYRSHARE_PROFILE_KEY = process.env.AYRSHARE_PROFILE_KEY; // Fallback

      // Validate configuration
      if (!AYRSHARE_API_KEY) {
        logError('generate-jwt', 'Missing AYRSHARE_API_KEY');
        return sendError(res, "Social media service not configured", ErrorCodes.CONFIG_ERROR);
      }

      if (!AYRSHARE_DOMAIN) {
        logError('generate-jwt', 'Missing AYRSHARE_DOMAIN');
        return sendError(res, "Social media service not configured", ErrorCodes.CONFIG_ERROR);
      }

      if (!AYRSHARE_PRIVATE_KEY) {
        logError('generate-jwt', 'Missing AYRSHARE_PRIVATE_KEY');
        return sendError(res, "Social media service not configured", ErrorCodes.CONFIG_ERROR);
      }

      // Get workspace's profile key from database
      let profileKey = null;
      let usingFallback = false;

      if (workspaceId) {
        const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
        if (workspaceProfileKey) {
          profileKey = workspaceProfileKey;
          console.log(`[generate-jwt] Using workspace profile key for workspace ${workspaceId}`);
        } else {
          console.warn(`[generate-jwt] Workspace ${workspaceId} has no profile key!`);
        }
      } else if (userId) {
        // Backwards compatibility: support userId for existing code
        const userProfileKey = await getUserProfileKey(userId);
        if (userProfileKey) {
          profileKey = userProfileKey;
          console.log(`[generate-jwt] Using user profile key`);
        }
      }

      // If no workspace/user profile key, fall back to env (but warn)
      if (!profileKey && AYRSHARE_PROFILE_KEY) {
        profileKey = AYRSHARE_PROFILE_KEY;
        usingFallback = true;
        console.warn(`[generate-jwt] FALLBACK: Using environment profile key - workspace may need profile creation`);
      }

      // If still no profile key, return error with helpful message
      if (!profileKey) {
        console.error(`[generate-jwt] No profile key available for workspace ${workspaceId}`);
        return sendError(
          res,
          "Your workspace needs to be set up before connecting social accounts. Please contact support if this issue persists.",
          ErrorCodes.CONFIG_ERROR
        );
      }

      console.log(`[generate-jwt] Final profile key: present (fallback: ${usingFallback})`);
      console.log(`[generate-jwt] AYRSHARE_DOMAIN: ${AYRSHARE_DOMAIN ? 'present' : 'MISSING'}`);
      console.log(`[generate-jwt] AYRSHARE_PRIVATE_KEY: ${AYRSHARE_PRIVATE_KEY ? 'present (length: ' + AYRSHARE_PRIVATE_KEY.length + ')' : 'MISSING'}`);
      console.log(`[generate-jwt] AYRSHARE_API_KEY: ${AYRSHARE_API_KEY ? 'present' : 'MISSING'}`);

      // Process the private key
      const privateKey = await readPrivateKey(AYRSHARE_PRIVATE_KEY);
      console.log(`[generate-jwt] Private key processed, length: ${privateKey.length}, starts with: ${privateKey.substring(0, 30)}...`);

      // Prepare JWT data for Ayrshare
      const jwtData = {
        domain: AYRSHARE_DOMAIN,
        privateKey,
        profileKey: profileKey,
        verify: true,
        logout: true  // Force logout of any existing Ayrshare sessions in browser
      };

      console.log(`[generate-jwt] Calling Ayrshare generateJWT...`);

      // Call Ayrshare API to generate JWT URL
      const response = await axios.post(
        `${BASE_AYRSHARE}/profiles/generateJWT`,
        jwtData,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AYRSHARE_API_KEY}`
          }
        }
      );

      console.log(`[generate-jwt] Success! URL received.`);

      // Return the JWT URL to the frontend
      return sendSuccess(res, { url: response.data.url });

    } catch (error) {
      logError('generate-jwt', error, {
        userId: req.query.userId,
        workspaceId: req.query.workspaceId,
        responseData: error.response?.data
      });

      // Return detailed error for debugging
      return sendError(
        res,
        "Failed to generate social account connection URL",
        ErrorCodes.EXTERNAL_API_ERROR,
        error.response?.data || error.message
      );
    }
  });
};
