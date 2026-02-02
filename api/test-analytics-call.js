const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  sendSuccess,
  sendError,
  ErrorCodes
} = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * TEST ENDPOINT - Diagnostic endpoint to test Ayrshare analytics API
 * GET /api/test-analytics-call?postId={ayrPostId}&workspaceId={workspaceId}
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  try {
    const { postId, workspaceId } = req.query;

    if (!postId || !workspaceId) {
      return sendError(res, "postId and workspaceId are required", ErrorCodes.VALIDATION_ERROR);
    }

    // Get profile key
    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No profile key found", ErrorCodes.VALIDATION_ERROR);
    }

    console.log('=== ANALYTICS DIAGNOSTIC TEST ===');
    console.log('Post ID:', postId);
    console.log('Post ID Type:', typeof postId);
    console.log('Post ID Length:', postId.length);
    console.log('Workspace ID:', workspaceId);
    console.log('Profile Key (first 10 chars):', profileKey.substring(0, 10) + '...');
    console.log('API Key exists:', !!process.env.AYRSHARE_API_KEY);

    const endpoint = `${BASE_AYRSHARE}/analytics/post/${postId}`;
    console.log('Full URL:', endpoint);

    // Try the API call
    try {
      const response = await axios.get(endpoint, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        },
        timeout: 30000
      });

      console.log('✅ SUCCESS - Response status:', response.status);
      console.log('Response data keys:', Object.keys(response.data));

      return sendSuccess(res, {
        success: true,
        message: "Analytics API call successful",
        postId,
        endpoint,
        responseStatus: response.status,
        responseData: response.data,
        diagnostic: {
          postIdType: typeof postId,
          postIdLength: postId.length,
          hasProfileKey: !!profileKey,
          hasApiKey: !!process.env.AYRSHARE_API_KEY
        }
      });

    } catch (ayrshareError) {
      const status = ayrshareError.response?.status;
      const responseData = ayrshareError.response?.data;
      const errorMessage = ayrshareError.message;

      console.log('❌ AYRSHARE API ERROR');
      console.log('Status:', status);
      console.log('Response data:', JSON.stringify(responseData, null, 2));
      console.log('Error message:', errorMessage);
      console.log('Request headers:', ayrshareError.config?.headers);

      return sendSuccess(res, {
        success: false,
        message: "Ayrshare API call failed",
        postId,
        endpoint,
        error: {
          status,
          responseData,
          errorMessage,
          headers: ayrshareError.config?.headers
        },
        diagnostic: {
          postIdType: typeof postId,
          postIdLength: postId.length,
          hasProfileKey: !!profileKey,
          hasApiKey: !!process.env.AYRSHARE_API_KEY,
          requestUrl: ayrshareError.config?.url
        }
      });
    }

  } catch (error) {
    console.error('Fatal error:', error);
    return sendError(res, error.message, ErrorCodes.INTERNAL_ERROR);
  }
};
