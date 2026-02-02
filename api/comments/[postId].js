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
 * Fetches comments for a specific post from database (populated by webhooks)
 * Falls back to Ayrshare API if refresh=true is specified
 *
 * Query params:
 * - workspaceId: Required workspace ID
 * - refresh: Optional, force refresh from Ayrshare (default: false)
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
    const { workspaceId, refresh = 'false' } = req.query;
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

    const supabase = getSupabase();
    if (!supabase) {
      return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
    }

    // First, try to find the post in our database using ayr_post_id
    const { data: post } = await supabase
      .from('posts')
      .select('id, workspace_id, ayr_post_id')
      .eq('ayr_post_id', postId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!post) {
      console.log(`[COMMENTS] Post not found in database with ayr_post_id: ${postId}`);
      return sendSuccess(res, {
        comments: [],
        postId,
        count: 0,
        message: 'Post not found in database'
      });
    }

    // Fetch engagement comments from social media (not internal team comments)
    const { data: dbComments, error: dbError } = await supabase
      .from('social_engagement_comments')
      .select('*')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });

    if (dbError) {
      console.error('[COMMENTS] Database error:', dbError);
      logError('comments.fetch.database', dbError, { postId });
    }

    // Normalize comments to match frontend expectations
    const comments = (dbComments || []).map(comment => ({
      id: comment.external_id,
      message: comment.comment_text,
      from: {
        name: comment.author_username || 'Unknown',
        profile_url: comment.author_profile_url
      },
      created_time: comment.created_at,
      platform: comment.platform,
      like_count: 0,
      comments: [] // Nested replies not yet supported
    }));

    console.log(`[COMMENTS] Found ${comments.length} comments in database for post ${postId}`);

    // If refresh is requested, also fetch from Ayrshare and sync
    if (refresh === 'true') {
      console.log('[COMMENTS] Refresh requested, fetching from Ayrshare...');

      const profileKey = await getWorkspaceProfileKey(workspaceId);
      if (profileKey) {
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
            const ayrshareComments = response.data.comments || response.data.data || [];
            console.log(`[COMMENTS] Fetched ${ayrshareComments.length} comments from Ayrshare`);

            // TODO: Sync Ayrshare comments to database
            // For now, just return Ayrshare comments
            const normalizedComments = ayrshareComments.map(comment => ({
              id: comment.id || comment.comment_id,
              message: comment.message || comment.text || comment.comment,
              from: comment.from || {
                name: comment.author_name || comment.username || 'Unknown',
                id: comment.author_id || comment.user_id
              },
              created_time: comment.created_time || comment.timestamp || comment.created_at,
              platform: comment.platform || response.data.platform,
              like_count: comment.like_count || 0,
              comments: comment.comments || comment.replies || []
            }));

            return sendSuccess(res, {
              comments: normalizedComments,
              postId,
              count: normalizedComments.length,
              source: 'ayrshare'
            });
          }
        } catch (ayrshareError) {
          console.error('[COMMENTS] Ayrshare error (falling back to database):', ayrshareError.message);
        }
      }
    }

    return sendSuccess(res, {
      comments,
      postId,
      count: comments.length,
      platform: comments[0]?.platform || 'unknown',
      source: 'database'
    });

  } catch (error) {
    logError('comments.handler', error);
    return sendError(res, "Failed to fetch comments", ErrorCodes.INTERNAL_ERROR);
  }
};
