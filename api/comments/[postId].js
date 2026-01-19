const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * GET /api/comments/[postId]
 * Fetches comments for a specific post from Ayrshare
 *
 * Query params:
 * - workspaceId: Required workspace ID
 * - refresh: Optional, force refresh from Ayrshare (default: true)
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
    const { workspaceId, refresh = 'true' } = req.query;
    const postId = req.query.postId || req.url.split('/comments/')[1]?.split('?')[0];

    if (!workspaceId) {
      return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!postId) {
      return sendError(res, "postId is required", ErrorCodes.VALIDATION_ERROR);
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No Ayrshare profile found for this workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Fetch comments from Ayrshare
    let comments = [];

    try {
      const response = await axios.get(
        `${BASE_AYRSHARE}/comments/${postId}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey
          },
          timeout: 30000
        }
      );

      if (response.data) {
        // Ayrshare returns comments in different formats depending on platform
        comments = response.data.comments || response.data.data || [];

        // Normalize comment structure
        comments = comments.map(comment => ({
          id: comment.id || comment.comment_id,
          message: comment.message || comment.text || comment.comment,
          from: comment.from || {
            name: comment.author_name || comment.username || 'Unknown',
            id: comment.author_id || comment.user_id
          },
          created_time: comment.created_time || comment.timestamp || comment.created_at,
          platform: comment.platform || response.data.platform,
          like_count: comment.like_count || 0,
          comments: comment.comments || comment.replies || [], // Nested replies
          ...comment // Include all other fields
        }));
      }
    } catch (ayrshareError) {
      // If Ayrshare returns 404 or error, return empty array
      if (ayrshareError.response?.status === 404) {
        logError('comments.fetch.notFound', { message: 'Post not found or no comments' }, { postId });
        return sendSuccess(res, { comments: [], postId, count: 0 });
      }

      logError('comments.fetch.ayrshare', ayrshareError, { postId, workspaceId });

      // Return empty comments instead of error for better UX
      if (ayrshareError.response?.status === 400 || ayrshareError.response?.status === 403) {
        return sendSuccess(res, {
          comments: [],
          postId,
          count: 0,
          message: 'Platform may not support comments or post is not accessible'
        });
      }

      return sendError(
        res,
        "Failed to fetch comments from social platform",
        ErrorCodes.EXTERNAL_API_ERROR,
        ayrshareError.response?.data
      );
    }

    return sendSuccess(res, {
      comments,
      postId,
      count: comments.length,
      platform: comments[0]?.platform || 'unknown'
    });

  } catch (error) {
    logError('comments.handler', error);
    return sendError(res, "Failed to fetch comments", ErrorCodes.INTERNAL_ERROR);
  }
};
