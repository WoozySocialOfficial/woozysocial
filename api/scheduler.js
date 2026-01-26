const axios = require("axios");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  getWorkspaceProfileKey,
  invalidateWorkspaceCache
} = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

// Helper to send post to Ayrshare
async function sendToAyrshare(post, profileKey) {
  const postData = {
    post: post.caption,
    platforms: post.platforms
  };

  // Handle media URLs
  if (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0) {
    const validMediaUrls = post.media_urls
      .filter(url => url && typeof url === 'string' && url.trim() !== '')
      .map(url => url.trim());

    if (validMediaUrls.length > 0) {
      postData.mediaUrls = validMediaUrls;
    }
  }

  console.log('[Scheduler] Sending post to Ayrshare:', {
    postId: post.id,
    platforms: post.platforms,
    hasMedia: !!postData.mediaUrls,
    mediaCount: postData.mediaUrls?.length || 0
  });

  const response = await axios.post(`${BASE_AYRSHARE}/post`, postData, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      "Profile-Key": profileKey
    },
    timeout: 55000 // 55 second timeout
  });

  return response.data;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.VALIDATION_ERROR);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    console.log('[Scheduler] Starting scheduled posts check...');

    // Get all scheduled posts that are due (scheduled_at <= now)
    const now = new Date().toISOString();
    const { data: duePosts, error: fetchError } = await supabase
      .from('posts')
      .select('*')
      .eq('status', 'scheduled')
      .eq('approval_status', 'approved')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(10); // Process 10 posts per run

    if (fetchError) {
      console.error('[Scheduler] Error fetching due posts:', fetchError);
      logError('scheduler.fetch', fetchError);
      return sendError(res, "Failed to fetch scheduled posts", ErrorCodes.DATABASE_ERROR);
    }

    if (!duePosts || duePosts.length === 0) {
      console.log('[Scheduler] No posts due for publishing');
      return sendSuccess(res, { processed: 0, message: 'No posts due' });
    }

    console.log(`[Scheduler] Found ${duePosts.length} posts due for publishing`);

    const results = {
      success: [],
      failed: []
    };

    // Process each post
    for (const post of duePosts) {
      try {
        console.log(`[Scheduler] Processing post ${post.id}...`);

        // Get profile key for the workspace
        const profileKey = await getWorkspaceProfileKey(post.workspace_id);

        if (!profileKey) {
          console.error(`[Scheduler] No profile key for workspace ${post.workspace_id}`);

          // Update post as failed
          await supabase
            .from('posts')
            .update({
              status: 'failed',
              last_error: 'No social media accounts connected',
              posted_at: new Date().toISOString()
            })
            .eq('id', post.id);

          results.failed.push({
            postId: post.id,
            error: 'No profile key'
          });
          continue;
        }

        // Send to Ayrshare
        const ayrshareResponse = await sendToAyrshare(post, profileKey);

        // Update post as posted
        const ayrPostId = ayrshareResponse.posts?.[0]?.id || ayrshareResponse.id || ayrshareResponse.postId;

        const { error: updateError } = await supabase
          .from('posts')
          .update({
            status: 'posted',
            ayr_post_id: ayrPostId,
            posted_at: new Date().toISOString(),
            last_error: null
          })
          .eq('id', post.id);

        if (updateError) {
          console.error(`[Scheduler] Error updating post ${post.id}:`, updateError);
          logError('scheduler.update', updateError, { postId: post.id });
        }

        console.log(`[Scheduler] Post ${post.id} published successfully`);

        // Invalidate cache after successful post
        await invalidateWorkspaceCache(post.workspace_id);

        results.success.push({
          postId: post.id,
          ayrPostId
        });

      } catch (postError) {
        console.error(`[Scheduler] Error processing post ${post.id}:`, postError);
        logError('scheduler.process', postError, { postId: post.id });

        // Update post as failed
        await supabase
          .from('posts')
          .update({
            status: 'failed',
            last_error: postError.response?.data?.message || postError.message,
            posted_at: new Date().toISOString()
          })
          .eq('id', post.id);

        results.failed.push({
          postId: post.id,
          error: postError.message
        });
      }
    }

    console.log('[Scheduler] Processing complete:', {
      total: duePosts.length,
      successful: results.success.length,
      failed: results.failed.length
    });

    return sendSuccess(res, {
      processed: duePosts.length,
      successful: results.success.length,
      failed: results.failed.length,
      results
    });

  } catch (error) {
    console.error('[Scheduler] Unexpected error:', error);
    logError('scheduler.handler', error);
    return sendError(
      res,
      `Scheduler error: ${error.message}`,
      ErrorCodes.INTERNAL_ERROR
    );
  }
};

// Allow 60 seconds for processing scheduled posts
module.exports.config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60
};
