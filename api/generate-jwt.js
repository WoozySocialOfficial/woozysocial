const axios = require("axios");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  applyRateLimit,
  isServiceConfigured,
  isValidUUID
} = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

// Get workspace profile key from database
const getWorkspaceProfileKey = async (workspaceId) => {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('ayr_profile_key, name')
      .eq('id', workspaceId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    logError('generate-jwt.getWorkspace', error, { workspaceId });
    return null;
  }
};

// Create Ayrshare profile for Business Plan
const createAyrshareProfile = async (title) => {
  try {
    const response = await axios.post(
      `${BASE_AYRSHARE}/profiles/profile`,
      { title },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`
        },
        timeout: 30000
      }
    );

    return response.data.profileKey;
  } catch (error) {
    logError('generate-jwt.createProfile', error);
    return null;
  }
};

// Update workspace with profile key
const updateWorkspaceProfileKey = async (workspaceId, profileKey) => {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('workspaces')
      .update({ ayr_profile_key: profileKey })
      .eq('id', workspaceId);

    if (error) throw error;
    return true;
  } catch (error) {
    logError('generate-jwt.updateWorkspace', error, { workspaceId });
    return false;
  }
};

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  // Rate limiting: 10 JWT generations per minute per user (auth endpoint)
  const rateLimited = applyRateLimit(req, res, 'generate-jwt', { maxRequests: 10, windowMs: 60000 });
  if (rateLimited) return;

  try {
    const { workspaceId } = req.query;

    // Validate required fields
    if (!workspaceId) {
      return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate UUID format
    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Check required services are configured
    if (!isServiceConfigured('ayrshareJwt')) {
      return sendError(
        res,
        "Social media connection service is not configured",
        ErrorCodes.CONFIG_ERROR
      );
    }

    if (!isServiceConfigured('ayrshare')) {
      return sendError(
        res,
        "Social media API is not configured",
        ErrorCodes.CONFIG_ERROR
      );
    }

    // Get workspace profile key for connecting accounts
    const workspace = await getWorkspaceProfileKey(workspaceId);

    if (!workspace) {
      return sendError(res, "Workspace not found", ErrorCodes.NOT_FOUND);
    }

    let profileKey = workspace.ayr_profile_key;

    // If no profile key exists, create one automatically (Business Plan feature)
    if (!profileKey) {
      profileKey = await createAyrshareProfile(workspace.name || 'My Business');

      if (profileKey) {
        // Save the new profile key to the workspace
        const updated = await updateWorkspaceProfileKey(workspaceId, profileKey);
        if (!updated) {
          logError('generate-jwt.saveProfile', 'Failed to save profile key to workspace', { workspaceId });
        }
      }
    }

    if (!profileKey) {
      return sendError(
        res,
        "Failed to create social media profile. Please try again or contact support.",
        ErrorCodes.EXTERNAL_API_ERROR
      );
    }

    // Handle private key - support both escaped \n and actual newlines
    let privateKey = process.env.AYRSHARE_PRIVATE_KEY;
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const jwtData = {
      domain: process.env.AYRSHARE_DOMAIN,
      privateKey,
      profileKey: profileKey,
      verify: true,
      logout: true
    };

    let response;
    try {
      response = await axios.post(
        `${BASE_AYRSHARE}/profiles/generateJWT`,
        jwtData,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`
          },
          timeout: 30000
        }
      );
    } catch (axiosError) {
      logError('generate-jwt.ayrshare', axiosError, { workspaceId });

      const errorMessage = axiosError.response?.data?.message ||
                          axiosError.response?.data?.error ||
                          'Unable to generate connection URL';

      return sendError(
        res,
        "Failed to generate social media connection URL",
        ErrorCodes.EXTERNAL_API_ERROR,
        errorMessage
      );
    }

    if (!response.data?.url) {
      return sendError(
        res,
        "Invalid response from social media service",
        ErrorCodes.EXTERNAL_API_ERROR
      );
    }

    return sendSuccess(res, { url: response.data.url });

  } catch (error) {
    logError('generate-jwt.handler', error, { method: req.method });
    return sendError(res, "An unexpected error occurred", ErrorCodes.INTERNAL_ERROR);
  }
};
