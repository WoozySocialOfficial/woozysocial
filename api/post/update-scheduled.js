const axios = require("axios");
const {
  setCors,
  getSupabase,
  parseBody,
  getWorkspaceProfileKey,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidUUID,
  invalidateWorkspaceCache
} = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * PUT /api/post/update-scheduled
 * Updates a scheduled post - both in database and Ayrshare
 *
 * Workflow:
 * 1. Update post in database
 * 2. Delete old scheduled post from Ayrshare (if it exists)
 * 3. Create new scheduled post in Ayrshare with updated data
 * 4. Update database with new ayr_post_id
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "PUT" && req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const body = await parseBody(req);
    const {
      postId,
      workspaceId,
      caption,
      mediaUrls,
      platforms,
      scheduledDate,
      postSettings
    } = body;

    // Validate required fields
    const validation = validateRequired(body, ['postId', 'workspaceId', 'caption', 'platforms', 'scheduledDate']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(postId) || !isValidUUID(workspaceId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get the existing post
    const { data: existingPost, error: fetchError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .eq('workspace_id', workspaceId)
      .single();

    if (fetchError || !existingPost) {
      logError('post.update-scheduled.fetch', fetchError, { postId });
      return sendError(res, "Post not found", ErrorCodes.NOT_FOUND);
    }

    // Step 1: Update post in database
    console.log('[update-scheduled] Updating post in database:', postId);
    const { error: updateError } = await supabase
      .from('posts')
      .update({
        caption,
        media_urls: mediaUrls || [],
        platforms,
        scheduled_at: scheduledDate,
        post_settings: postSettings || {},
        updated_at: new Date().toISOString()
      })
      .eq('id', postId);

    if (updateError) {
      logError('post.update-scheduled.update', updateError, { postId });
      return sendError(res, "Failed to update post", ErrorCodes.DATABASE_ERROR);
    }

    // Step 2: Delete old scheduled post from Ayrshare (if it exists and is still scheduled)
    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No Ayrshare profile found for this workspace", ErrorCodes.VALIDATION_ERROR);
    }

    if (existingPost.ayr_post_id && existingPost.status === 'scheduled') {
      try {
        console.log('[update-scheduled] Deleting old post from Ayrshare:', existingPost.ayr_post_id);
        await axios.delete(
          `${BASE_AYRSHARE}/history/${existingPost.ayr_post_id}`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
              "Profile-Key": profileKey
            },
            timeout: 30000
          }
        );
        console.log('[update-scheduled] Old post deleted from Ayrshare');
      } catch (deleteError) {
        // Log but don't fail - post might have already been posted or deleted
        console.warn('[update-scheduled] Could not delete old post from Ayrshare:', deleteError.message);
      }
    }

    // Step 3: Create new scheduled post in Ayrshare
    console.log('[update-scheduled] Creating new scheduled post in Ayrshare');
    const postData = {
      post: caption,
      platforms,
      scheduleDate: new Date(scheduledDate).toISOString()
    };

    if (mediaUrls && mediaUrls.length > 0) {
      postData.mediaUrls = mediaUrls.filter(url => url && url.startsWith('http'));
    }

    // Parse postSettings (mirrors api/post.js logic)
    let settings = {};
    if (postSettings) {
      if (typeof postSettings === 'string') {
        try { settings = JSON.parse(postSettings); } catch (e) { /* ignore malformed */ }
      } else {
        settings = postSettings;
      }
    }

    // Auto-shorten links
    if (settings.shortenLinks) {
      postData.shortenLinks = true;
    }

    // Twitter/X thread options
    const hasTwitter = platforms.some(p => ['twitter', 'x'].includes(p.toLowerCase()));
    if (settings.threadPost && hasTwitter) {
      postData.twitterOptions = {
        thread: true,
        threadNumber: settings.threadNumber !== false
      };
    }

    // Instagram post type options
    const hasInstagram = platforms.some(p => p.toLowerCase() === 'instagram');
    if (settings.instagramType && hasInstagram) {
      if (settings.instagramType === 'story') {
        postData.instagramOptions = { stories: true };
      } else if (settings.instagramType === 'reel') {
        postData.instagramOptions = { reels: true, shareReelsFeed: true };
      }
      // 'feed' is default — no special options needed
    }

    const ayrshareResponse = await axios.post(
      `${BASE_AYRSHARE}/post`,
      postData,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        },
        timeout: 30000
      }
    );

    if (ayrshareResponse.data.status === 'error') {
      logError('post.update-scheduled.ayrshare', new Error(ayrshareResponse.data.message), { postId });
      return sendError(
        res,
        "Failed to reschedule post in Ayrshare",
        ErrorCodes.EXTERNAL_API_ERROR,
        ayrshareResponse.data
      );
    }

    // Step 4: Update database with new ayr_post_id
    const newAyrPostId = ayrshareResponse.data.posts?.[0]?.id || ayrshareResponse.data.id;
    console.log('[update-scheduled] New Ayrshare post ID:', newAyrPostId);

    const { error: finalUpdateError } = await supabase
      .from('posts')
      .update({
        ayr_post_id: newAyrPostId,
        updated_at: new Date().toISOString()
      })
      .eq('id', postId);

    if (finalUpdateError) {
      logError('post.update-scheduled.final-update', finalUpdateError, { postId });
    }

    // Invalidate cache
    await invalidateWorkspaceCache(workspaceId);

    return sendSuccess(res, {
      postId,
      ayr_post_id: newAyrPostId,
      message: "Post updated and rescheduled successfully"
    });

  } catch (error) {
    logError('post.update-scheduled.handler', error);
    return sendError(res, "Failed to update scheduled post", ErrorCodes.INTERNAL_ERROR);
  }
};
