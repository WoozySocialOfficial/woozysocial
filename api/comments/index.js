const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  parseBody,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * POST /api/comments
 * Post a new comment on a post
 *
 * Body:
 * - workspaceId: Required workspace ID
 * - postId: Required post ID
 * - comment: Required comment text
 * - platform: Required platform (facebook, instagram, linkedin, etc.)
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  try {
    const body = await parseBody(req);
    const { workspaceId, postId, comment, platform } = body;

    if (!workspaceId || !postId || !comment) {
      return sendError(
        res,
        "workspaceId, postId, and comment are required",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!comment.trim()) {
      return sendError(res, "Comment text cannot be empty", ErrorCodes.VALIDATION_ERROR);
    }

    if (comment.length > 2000) {
      return sendError(res, "Comment text exceeds maximum length of 2000 characters", ErrorCodes.VALIDATION_ERROR);
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No Ayrshare profile found for this workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Post comment via Ayrshare
    try {
      const response = await axios.post(
        `${BASE_AYRSHARE}/comments/${postId}`,
        {
          message: comment,
          platform: platform || 'facebook' // Default to Facebook if not specified
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey
          },
          timeout: 30000
        }
      );

      if (response.data && (response.data.status === 'success' || response.data.id)) {
        return sendSuccess(res, {
          success: true,
          comment: {
            id: response.data.id || response.data.comment_id,
            message: comment,
            postId: postId,
            created_time: new Date().toISOString(),
            from: {
              name: 'You',
              id: 'self'
            }
          },
          ayrshareResponse: response.data
        });
      } else {
        return sendError(
          res,
          "Failed to post comment",
          ErrorCodes.EXTERNAL_API_ERROR,
          response.data
        );
      }
    } catch (ayrshareError) {
      logError('comments.post.ayrshare', ayrshareError, { postId });

      const errorMessage = ayrshareError.response?.data?.message ||
                          ayrshareError.response?.data?.error ||
                          'Failed to post comment';

      return sendError(
        res,
        errorMessage,
        ErrorCodes.EXTERNAL_API_ERROR,
        ayrshareError.response?.data
      );
    }

  } catch (error) {
    logError('comments.post.handler', error);
    return sendError(res, "Failed to post comment", ErrorCodes.INTERNAL_ERROR);
  }
};
