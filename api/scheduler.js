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

  // Parse and apply post settings (Phase 4)
  let settings = {};
  if (post.post_settings) {
    if (typeof post.post_settings === 'string') {
      try {
        settings = JSON.parse(post.post_settings);
      } catch (e) {
        console.error('[Scheduler] Failed to parse post_settings:', e);
      }
    } else {
      settings = post.post_settings;
    }
  }

  // Auto-shorten links
  if (settings.shortenLinks) {
    postData.shortenLinks = true;
    console.log('[Scheduler] - shortenLinks enabled');
  }

  // Twitter thread options
  const platforms = post.platforms || [];
  const hasTwitter = platforms.some(p => ['twitter', 'x'].includes(p.toLowerCase()));
  if (settings.threadPost && hasTwitter) {
    postData.twitterOptions = {
      thread: true,
      threadNumber: settings.threadNumber !== false
    };
    console.log('[Scheduler] - Twitter thread options:', postData.twitterOptions);
  }

  // Instagram post type options
  const hasInstagram = platforms.some(p => p.toLowerCase() === 'instagram');
  if (settings.instagramType && hasInstagram) {
    if (settings.instagramType === 'story') {
      postData.instagramOptions = { stories: true };
      console.log('[Scheduler] - Instagram Story mode enabled');
    } else if (settings.instagramType === 'reel') {
      postData.instagramOptions = { reels: true, shareReelsFeed: true };
      console.log('[Scheduler] - Instagram Reel mode enabled');
    }
  }

  // Twitter thread auto-splitting (same logic as api/post.js)
  if (settings.threadPost && hasTwitter) {
    const text = post.caption;
    const paragraphs = text.split('\n\n');
    const processedParagraphs = [];

    for (const paragraph of paragraphs) {
      if (paragraph.length <= 280) {
        processedParagraphs.push(paragraph);
      } else {
        console.log(`[Scheduler] Auto-splitting long paragraph (${paragraph.length} chars) for thread`);

        const sentences = paragraph.split(/([.!?])\s+/).filter(s => s.trim().length > 0);
        let currentChunk = '';

        for (let i = 0; i < sentences.length; i++) {
          const sentence = sentences[i];

          if (currentChunk.length + sentence.length + 1 > 280) {
            if (currentChunk.trim().length > 0) {
              processedParagraphs.push(currentChunk.trim());
              currentChunk = sentence;
            } else {
              // Single sentence too long, split at word boundaries
              const words = sentence.split(' ');
              let wordChunk = '';
              for (const word of words) {
                if (wordChunk.length + word.length + 1 > 280) {
                  if (wordChunk.trim().length > 0) {
                    processedParagraphs.push(wordChunk.trim());
                    wordChunk = word;
                  } else {
                    processedParagraphs.push(word);
                  }
                } else {
                  wordChunk += (wordChunk.length > 0 ? ' ' : '') + word;
                }
              }
              if (wordChunk.trim().length > 0) {
                currentChunk = wordChunk;
              }
            }
          } else {
            currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
          }
        }

        if (currentChunk.trim().length > 0) {
          processedParagraphs.push(currentChunk.trim());
        }
      }
    }

    const processedText = processedParagraphs.join('\n\n');
    if (processedText !== text) {
      console.log(`[Scheduler] Text auto-split for threading: ${paragraphs.length} → ${processedParagraphs.length} paragraphs`);
      postData.post = processedText;
    }
  }

  console.log('[Scheduler] Sending post to Ayrshare:', {
    postId: post.id,
    platforms: post.platforms,
    hasMedia: !!postData.mediaUrls,
    mediaCount: postData.mediaUrls?.length || 0,
    shortenLinks: postData.shortenLinks,
    twitterOptions: postData.twitterOptions,
    instagramOptions: postData.instagramOptions
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
  setCors(res, req);

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

        // Check if post already has ayr_post_id (was sent to Ayrshare with scheduleDate)
        // In this case, Ayrshare handled the scheduling, we just need to update status
        // NO LOCKING NEEDED since we're not sending to Ayrshare
        if (post.ayr_post_id) {
          console.log(`[Scheduler] Post ${post.id} already sent to Ayrshare (ayr_post_id: ${post.ayr_post_id}), updating status to posted`);

          const { error: updateError } = await supabase
            .from('posts')
            .update({
              status: 'posted',
              posted_at: new Date().toISOString(),
              last_error: null
            })
            .eq('id', post.id)
            .eq('status', 'scheduled'); // Only update if still scheduled

          if (updateError) {
            console.error(`[Scheduler] Error updating post ${post.id}:`, updateError);
            logError('scheduler.update_scheduled', updateError, { postId: post.id });
            results.failed.push({
              postId: post.id,
              error: updateError.message
            });
          } else {
            console.log(`[Scheduler] Post ${post.id} status updated to posted`);

            // Invalidate cache after updating status
            await invalidateWorkspaceCache(post.workspace_id);

            results.success.push({
              postId: post.id,
              ayrPostId: post.ayr_post_id,
              note: 'Status updated (post was already scheduled in Ayrshare)'
            });
          }

          continue; // Skip to next post
        }

        // CRITICAL: Set status to 'processing' to prevent race conditions
        // This prevents concurrent scheduler runs from picking up the same post
        const { data: lockData, error: lockError, count } = await supabase
          .from('posts')
          .update({ status: 'processing' })
          .eq('id', post.id)
          .eq('status', 'scheduled') // Only update if still scheduled
          .select();

        // If no rows were updated, another scheduler instance already locked this post
        if (lockError || !lockData || lockData.length === 0) {
          console.warn(`[Scheduler] Post ${post.id} already being processed by another instance - skipping`);
          continue; // Don't add to results, just skip silently
        }

        console.log(`[Scheduler] Successfully locked post ${post.id} for processing`);

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

        // IMPORTANT: Check if Ayrshare returned success data despite HTTP 400 status
        // Ayrshare has a quirk where it returns HTTP 400 with a success response body
        const responseData = postError.response?.data;
        const isActuallySuccessful = responseData?.status === 'success'
          || (Array.isArray(responseData?.errors) && responseData.errors.length === 0)
          || responseData?.postIds?.length > 0;

        const ayrPostId = responseData?.postIds?.[0]?.id
          || responseData?.posts?.[0]?.id
          || responseData?.id
          || responseData?.postId
          || responseData?.refId;

        if (isActuallySuccessful && ayrPostId) {
          // Post actually succeeded despite HTTP 400 - save as successful
          console.log(`[Scheduler] Post ${post.id} succeeded despite HTTP 400 - ayr_post_id: ${ayrPostId}`);

          await supabase
            .from('posts')
            .update({
              status: 'posted',
              ayr_post_id: ayrPostId,
              posted_at: new Date().toISOString(),
              last_error: null
            })
            .eq('id', post.id);

          // Invalidate cache after successful post
          await invalidateWorkspaceCache(post.workspace_id);

          results.success.push({
            postId: post.id,
            ayrPostId,
            warning: 'Succeeded despite HTTP 400'
          });
        } else {
          // Post actually failed - no post ID found
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
