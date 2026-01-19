const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * DELETE /api/comments/delete/[commentId]
 * Delete a comment from a post
 *
 * Query params:
 * - workspaceId: Required workspace ID
 * - postId: Optional post ID for context
 * - platform: Optional platform (facebook, instagram, linkedin, etc.)
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "DELETE") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  try {
    const { workspaceId, postId, platform } = req.query;
    const commentId = req.query.commentId || req.url.split('/delete/')[1]?.split('?')[0];

    if (!workspaceId || !commentId) {
      return sendError(
        res,
        "workspaceId and commentId are required",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No Ayrshare profile found for this workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Delete comment via Ayrshare
    try {
      const response = await axios.delete(
        `${BASE_AYRSHARE}/comments/${commentId}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey
          },
          params: {
            platform: platform || 'facebook'
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.status === 'success') {
        return sendSuccess(res, {
          success: true,
          commentId: commentId,
          message: 'Comment deleted successfully'
        });
      } else {
        return sendError(
          res,
          "Failed to delete comment",
          ErrorCodes.EXTERNAL_API_ERROR,
          response.data
        );
      }
    } catch (ayrshareError) {
      logError('comments.delete.ayrshare', ayrshareError, { commentId });

      const errorMessage = ayrshareError.response?.data?.message ||
                          ayrshareError.response?.data?.error ||
                          'Failed to delete comment';

      return sendError(
        res,
        errorMessage,
        ErrorCodes.EXTERNAL_API_ERROR,
        ayrshareError.response?.data
      );
    }

  } catch (error) {
    logError('comments.delete.handler', error);
    return sendError(res, "Failed to delete comment", ErrorCodes.INTERNAL_ERROR);
  }
};
