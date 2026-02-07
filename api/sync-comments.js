const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  parseBody
} = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * POST /api/sync-comments
 * Manually syncs comments from Ayrshare for a specific post
 *
 * Body:
 * - postId: Ayrshare post ID
 * - workspaceId: Workspace ID
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
    const { postId, workspaceId } = body;

    if (!postId || !workspaceId) {
      return sendError(res, "postId and workspaceId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    const supabase = getSupabase();
    if (!supabase) {
      return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
    }

    // Get profile key
    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No Ayrshare profile found for this workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Find the post in database
    const { data: post } = await supabase
      .from('posts')
      .select('id, workspace_id, ayr_post_id')
      .eq('ayr_post_id', postId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!post) {
      return sendError(res, "Post not found in database", ErrorCodes.VALIDATION_ERROR);
    }

    console.log(`[SYNC-COMMENTS] Fetching comments from Ayrshare for post ${postId}`);

    // Fetch comments from Ayrshare
    let ayrshareComments = [];
    let responsePlatform = 'unknown';
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
        // Ayrshare returns comments keyed by platform: { facebook: [...], tiktok: [...], status, id }
        const platformKeys = ['facebook', 'instagram', 'twitter', 'tiktok', 'linkedin', 'youtube', 'bluesky', 'threads', 'reddit'];
        for (const platform of platformKeys) {
          if (Array.isArray(response.data[platform])) {
            const platformComments = response.data[platform].map(c => ({ ...c, platform }));
            ayrshareComments.push(...platformComments);
          }
        }
        // Fallback for unexpected response shapes
        if (ayrshareComments.length === 0 && Array.isArray(response.data.comments)) {
          ayrshareComments = response.data.comments;
        }
        console.log(`[SYNC-COMMENTS] Fetched ${ayrshareComments.length} comments from Ayrshare`);
        console.log(`[SYNC-COMMENTS] Response keys:`, Object.keys(response.data));
      }
    } catch (ayrshareError) {
      if (ayrshareError.response?.status === 404) {
        console.log('[SYNC-COMMENTS] No comments found or post not accessible');
        return sendSuccess(res, {
          synced: 0,
          message: 'No comments found for this post'
        });
      }

      logError('sync-comments.ayrshare', ayrshareError);
      return sendError(
        res,
        "Failed to fetch comments from Ayrshare",
        ErrorCodes.EXTERNAL_API_ERROR,
        ayrshareError.response?.data
      );
    }

    // Sync comments to database
    let syncedCount = 0;
    let skippedCount = 0;

    for (const comment of ayrshareComments) {
      const commentId = comment.commentId || comment.id || comment.comment_id;
      const commentText = comment.comment || comment.text || comment.message;
      const platform = comment.platform || responsePlatform;
      const authorUsername = comment.from?.name || comment.userName || comment.username || comment.author_name || 'Unknown';
      const authorProfileUrl = comment.from?.profile_url || comment.author_profile_url;
      const createdAt = comment.created || comment.created_time || comment.timestamp || comment.created_at || new Date().toISOString();

      if (!commentId || !commentText) {
        console.warn('[SYNC-COMMENTS] Skipping comment with missing data:', comment);
        skippedCount++;
        continue;
      }

      // Insert comment (ignore duplicates)
      const { error: insertError } = await supabase
        .from('social_engagement_comments')
        .insert({
          post_id: post.id,
          workspace_id: post.workspace_id,
          platform: platform,
          external_id: commentId,
          comment_text: commentText,
          author_username: authorUsername,
          author_profile_url: authorProfileUrl,
          created_at: createdAt
        });

      if (insertError) {
        if (insertError.code === '23505') {
          // Duplicate - already exists
          skippedCount++;
        } else {
          console.error('[SYNC-COMMENTS] Error inserting comment:', insertError);
          logError('sync-comments.insert', insertError, { commentId, postId });
        }
      } else {
        syncedCount++;
      }
    }

    console.log(`[SYNC-COMMENTS] Sync complete: ${syncedCount} new, ${skippedCount} skipped`);

    return sendSuccess(res, {
      synced: syncedCount,
      skipped: skippedCount,
      total: ayrshareComments.length,
      message: `Synced ${syncedCount} new comments`
    });

  } catch (error) {
    logError('sync-comments.handler', error);
    return sendError(res, "Failed to sync comments", ErrorCodes.INTERNAL_ERROR);
  }
};
