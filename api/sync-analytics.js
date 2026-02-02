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
 * POST /api/sync-analytics
 * Fetches analytics from Ayrshare for a specific post or all recent posts
 *
 * Body:
 * - postId: Optional Ayrshare post ID (if omitted, syncs all recent posts)
 * - workspaceId: Required workspace ID
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

    if (!workspaceId) {
      return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
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

    let postsToSync = [];

    if (postId) {
      // Sync single post
      const { data: post } = await supabase
        .from('posts')
        .select('id, ayr_post_id')
        .eq('ayr_post_id', postId)
        .eq('workspace_id', workspaceId)
        .single();

      if (!post) {
        return sendError(res, "Post not found in database", ErrorCodes.VALIDATION_ERROR);
      }

      postsToSync = [post];
    } else {
      // Sync all recent posted posts (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: posts } = await supabase
        .from('posts')
        .select('id, ayr_post_id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'posted')
        .not('ayr_post_id', 'is', null)
        .gte('posted_at', thirtyDaysAgo.toISOString())
        .order('posted_at', { ascending: false })
        .limit(50);

      postsToSync = posts || [];
    }

    console.log(`[SYNC-ANALYTICS] Syncing analytics for ${postsToSync.length} posts`);

    let syncedCount = 0;
    let failedCount = 0;

    for (const post of postsToSync) {
      try {
        // Fetch analytics from Ayrshare using POST with JSON body
        const response = await axios.post(
          `${BASE_AYRSHARE}/analytics/post`,
          {
            id: post.ayr_post_id
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

        if (response.data) {
          const analytics = response.data;

          // Store analytics in posts.analytics JSONB column
          const { error: updateError } = await supabase
            .from('posts')
            .update({
              analytics: analytics,
              analytics_updated_at: new Date().toISOString()
            })
            .eq('id', post.id);

          if (updateError) {
            console.error(`[SYNC-ANALYTICS] Error updating post ${post.ayr_post_id}:`, updateError);
            failedCount++;
          } else {
            console.log(`[SYNC-ANALYTICS] Synced analytics for post ${post.ayr_post_id}`);
            syncedCount++;
          }
        }
      } catch (ayrshareError) {
        // If post not found or no analytics, skip
        if (ayrshareError.response?.status === 404) {
          console.log(`[SYNC-ANALYTICS] No analytics found for post ${post.ayr_post_id}`);
        } else {
          console.error(`[SYNC-ANALYTICS] Error fetching analytics for post ${post.ayr_post_id}:`, ayrshareError.message);
          failedCount++;
        }
      }
    }

    console.log(`[SYNC-ANALYTICS] Sync complete: ${syncedCount} synced, ${failedCount} failed`);

    return sendSuccess(res, {
      synced: syncedCount,
      failed: failedCount,
      total: postsToSync.length,
      message: `Synced analytics for ${syncedCount} posts`
    });

  } catch (error) {
    logError('sync-analytics.handler', error);
    return sendError(res, "Failed to sync analytics", ErrorCodes.INTERNAL_ERROR);
  }
};
