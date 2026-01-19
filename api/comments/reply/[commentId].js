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
} = require("../../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * POST /api/comments/reply/[commentId]
 * Reply to a specific comment on a post
 *
 * Body:
 * - workspaceId: Required workspace ID
 * - postId: Required post ID
 * - reply: Required reply text
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
    const { workspaceId, postId, reply, platform } = body;
    const commentId = req.query.commentId || req.url.split('/reply/')[1]?.split('?')[0];

    if (!workspaceId || !postId || !reply || !commentId) {
      return sendError(
        res,
        "workspaceId, postId, reply, and commentId are required",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!reply.trim()) {
      return sendError(res, "Reply text cannot be empty", ErrorCodes.VALIDATION_ERROR);
    }

    if (reply.length > 2000) {
      return sendError(res, "Reply text exceeds maximum length of 2000 characters", ErrorCodes.VALIDATION_ERROR);
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No Ayrshare profile found for this workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Reply to comment via Ayrshare
    try {
      const response = await axios.post(
        `${BASE_AYRSHARE}/comments/${postId}/reply`,
        {
          commentId: commentId,
          message: reply,
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
          reply: {
            id: response.data.id || response.data.reply_id,
            message: reply,
            commentId: commentId,
            postId: postId,
            created_time: new Date().toISOString()
          },
          ayrshareResponse: response.data
        });
      } else {
        return sendError(
          res,
          "Failed to post reply",
          ErrorCodes.EXTERNAL_API_ERROR,
          response.data
        );
      }
    } catch (ayrshareError) {
      logError('comments.reply.ayrshare', ayrshareError, { postId, commentId });

      const errorMessage = ayrshareError.response?.data?.message ||
                          ayrshareError.response?.data?.error ||
                          'Failed to post reply';

      return sendError(
        res,
        errorMessage,
        ErrorCodes.EXTERNAL_API_ERROR,
        ayrshareError.response?.data
      );
    }

  } catch (error) {
    logError('comments.reply.handler', error);
    return sendError(res, "Failed to post reply", ErrorCodes.INTERNAL_ERROR);
  }
};
