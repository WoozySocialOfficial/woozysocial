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
const { sendPostFailedNotification } = require("./notifications/helpers");

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

  // Validate media format compatibility before sending
  if (postData.mediaUrls && postData.mediaUrls.length > 0) {
    const hasTikTok = platforms.some(p => p.toLowerCase() === 'tiktok');
    for (const url of postData.mediaUrls) {
      const ext = url.toLowerCase().split('?')[0].split('.').pop();
      if (hasTikTok && (ext === 'png' || ext === 'gif' || ext === 'webp')) {
        const errorMsg = `TikTok does not support ${ext.toUpperCase()} images`;
        console.error(`[Scheduler] Media validation failed for post ${post.id}: ${errorMsg}`);
        throw new Error(errorMsg);
      }
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

    // Clean up posts stuck in 'processing' state from crashed/timed-out scheduler runs
    // If scheduled_at is >3 minutes ago and still 'processing', the previous run must have failed
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data: stuckPosts } = await supabase
      .from('posts')
      .update({ status: 'scheduled', last_error: 'Reset from stuck processing state' })
      .eq('status', 'processing')
      .lte('scheduled_at', threeMinAgo)
      .select('id');

    if (stuckPosts && stuckPosts.length > 0) {
      console.warn(`[Scheduler] Reset ${stuckPosts.length} posts stuck in 'processing':`, stuckPosts.map(p => p.id));
    }

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

    const results = {
      success: [],
      failed: []
    };

    if (!duePosts || duePosts.length === 0) {
      console.log('[Scheduler] No posts due for publishing');
    } else {
      console.log(`[Scheduler] Found ${duePosts.length} posts due for publishing`);
    }

    // Process each due post (skip if none)
    for (const post of (duePosts || [])) {
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

          sendPostFailedNotification(supabase, {
            postId: post.id,
            workspaceId: post.workspace_id,
            createdByUserId: post.created_by || post.user_id,
            platforms: post.platforms,
            errorMessage: 'No social media accounts connected'
          }).catch(err => logError('scheduler.notification.failed', err, { postId: post.id }));

          results.failed.push({
            postId: post.id,
            error: 'No profile key'
          });
          continue;
        }

        // Send to Ayrshare
        const ayrshareResponse = await sendToAyrshare(post, profileKey);

        // Extract ayr_post_id from Ayrshare response (handles multiple response formats)
        const ayrPostId = ayrshareResponse.id
          || ayrshareResponse.postId
          || ayrshareResponse.scheduleId
          || ayrshareResponse.refId
          || ayrshareResponse.posts?.[0]?.id
          || ayrshareResponse.postIds?.[0]?.id
          || ayrshareResponse.postIds?.[0];

        if (!ayrPostId) {
          console.error(`[Scheduler] WARNING: No post ID extracted from Ayrshare response for post ${post.id}. Full response:`, JSON.stringify(ayrshareResponse));
        }

        // Update post as posted (always mark as posted to prevent duplicate sends)
        const { error: updateError } = await supabase
          .from('posts')
          .update({
            status: 'posted',
            ayr_post_id: ayrPostId || null,
            posted_at: new Date().toISOString(),
            last_error: ayrPostId ? null : 'Posted but no ayr_post_id extracted from response'
          })
          .eq('id', post.id);

        if (updateError) {
          console.error(`[Scheduler] Error updating post ${post.id}:`, updateError);
          logError('scheduler.update', updateError, { postId: post.id });
        }

        console.log(`[Scheduler] Post ${post.id} published successfully (ayr_post_id: ${ayrPostId || 'none'})`);

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

        // Log full response for debugging status mismatches
        console.log(`[Scheduler] Full error response for post ${post.id}:`, JSON.stringify(responseData));

        // Require positive evidence of success — don't treat empty errors array as success
        const isActuallySuccessful = responseData?.status === 'success'
          || responseData?.postIds?.length > 0
          || (Array.isArray(responseData?.posts) && responseData.posts.some(p => p.id || p.postUrl))
          || !!responseData?.id
          || !!responseData?.scheduleId;

        const ayrPostId = responseData?.id
          || responseData?.postId
          || responseData?.scheduleId
          || responseData?.refId
          || responseData?.postIds?.[0]?.id
          || responseData?.postIds?.[0]
          || responseData?.posts?.[0]?.id;

        if (isActuallySuccessful) {
          // Post actually succeeded despite HTTP error - save as successful
          console.log(`[Scheduler] Post ${post.id} succeeded despite HTTP error - ayr_post_id: ${ayrPostId || 'unknown'}`);

          const updateData = {
            status: 'posted',
            posted_at: new Date().toISOString(),
            last_error: null
          };
          if (ayrPostId) {
            updateData.ayr_post_id = ayrPostId;
          }

          await supabase
            .from('posts')
            .update(updateData)
            .eq('id', post.id);

          // Invalidate cache after successful post
          await invalidateWorkspaceCache(post.workspace_id);

          results.success.push({
            postId: post.id,
            ayrPostId: ayrPostId || 'unknown',
            warning: 'Succeeded despite HTTP error'
          });
        } else {
          // Post actually failed
          const failureReason = responseData?.message || postError.message;
          await supabase
            .from('posts')
            .update({
              status: 'failed',
              last_error: failureReason,
              posted_at: new Date().toISOString()
            })
            .eq('id', post.id);

          sendPostFailedNotification(supabase, {
            postId: post.id,
            workspaceId: post.workspace_id,
            createdByUserId: post.created_by || post.user_id,
            platforms: post.platforms,
            errorMessage: failureReason
          }).catch(err => logError('scheduler.notification.failed', err, { postId: post.id }));

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

    // ============================================================
    // RECONCILIATION: Check recently "failed" posts against Ayrshare
    // Fixes posts that actually succeeded but were marked failed
    // due to Ayrshare HTTP quirks
    // ============================================================
    let reconciled = 0;
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: failedPosts } = await supabase
        .from('posts')
        .select('id, workspace_id, caption, platforms, media_urls, posted_at')
        .eq('status', 'failed')
        .gte('posted_at', oneDayAgo)
        .limit(10);

      if (failedPosts && failedPosts.length > 0) {
        console.log(`[Scheduler] Reconciling ${failedPosts.length} recently failed posts against Ayrshare...`);

        // Group by workspace to minimize API calls
        const byWorkspace = {};
        for (const post of failedPosts) {
          if (!byWorkspace[post.workspace_id]) byWorkspace[post.workspace_id] = [];
          byWorkspace[post.workspace_id].push(post);
        }

        for (const [wsId, posts] of Object.entries(byWorkspace)) {
          const profileKey = await getWorkspaceProfileKey(wsId);
          if (!profileKey) continue;

          try {
            const historyRes = await axios.get(`${BASE_AYRSHARE}/history`, {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
                "Profile-Key": profileKey
              },
              timeout: 15000
            });

            const history = historyRes.data?.history || [];
            if (history.length === 0) continue;

            for (const post of posts) {
              // Match by caption content (first 100 chars) since we may not have ayr_post_id
              const captionStart = (post.caption || '').substring(0, 100).trim();
              if (!captionStart) continue;

              const match = history.find(h => {
                // Match by caption content
                const hBody = (h.body || h.post || '').substring(0, 100).trim();
                if (hBody !== captionStart) return false;

                // Also verify at least one platform matches to avoid false positives
                const hPlatforms = h.platforms || [];
                const postPlatforms = post.platforms || [];
                if (hPlatforms.length > 0 && postPlatforms.length > 0) {
                  const platformOverlap = postPlatforms.some(p => hPlatforms.includes(p));
                  if (!platformOverlap) return false;
                }

                // Check time proximity (within 2 hours) to avoid matching old posts
                if (h.created && post.posted_at) {
                  const timeDiff = Math.abs(new Date(h.created).getTime() - new Date(post.posted_at).getTime());
                  if (timeDiff > 2 * 60 * 60 * 1000) return false;
                }

                return true;
              });

              if (match) {
                // Don't reconcile if Ayrshare reports delivery errors for this post
                const matchErrors = Array.isArray(match.errors)
                  ? match.errors.filter(e => e.status === 'error' || e.code)
                  : [];
                if (matchErrors.length > 0 || match.status === 'error') {
                  console.log(`[Scheduler] Reconciliation: Post ${post.id} found in Ayrshare (${match.id}) but has delivery errors - skipping`);
                  continue;
                }

                console.log(`[Scheduler] Reconciliation: Post ${post.id} found in Ayrshare history (${match.id}) - updating to posted`);
                await supabase
                  .from('posts')
                  .update({
                    status: 'posted',
                    ayr_post_id: match.id,
                    last_error: null
                  })
                  .eq('id', post.id);

                await invalidateWorkspaceCache(wsId);
                reconciled++;
              }
            }
          } catch (histErr) {
            console.warn(`[Scheduler] Reconciliation: Failed to fetch history for workspace ${wsId}:`, histErr.message);
          }
        }

        if (reconciled > 0) {
          console.log(`[Scheduler] Reconciliation: Fixed ${reconciled} incorrectly failed posts`);
        }
      }
    } catch (reconErr) {
      console.warn('[Scheduler] Reconciliation error (non-blocking):', reconErr.message);
    }

    // ============================================================
    // REVERSE RECONCILIATION: Check "posted" posts for delivery failures
    // Catches posts accepted by Ayrshare but rejected by the target platform
    // e.g. TikTok rejecting PNG images, text-only posts, etc.
    // ============================================================
    let reverseReconciled = 0;
    try {
      const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: postedPosts } = await supabase
        .from('posts')
        .select('id, workspace_id, ayr_post_id, platforms, caption, created_by, user_id')
        .eq('status', 'posted')
        .not('ayr_post_id', 'is', null)
        .gte('posted_at', recentCutoff)
        .limit(20);

      if (postedPosts && postedPosts.length > 0) {
        console.log(`[Scheduler] Reverse reconciliation: Checking ${postedPosts.length} recently posted posts for delivery failures...`);

        // Group by workspace to minimize Ayrshare API calls
        const byWorkspace = {};
        for (const post of postedPosts) {
          if (!byWorkspace[post.workspace_id]) byWorkspace[post.workspace_id] = [];
          byWorkspace[post.workspace_id].push(post);
        }

        for (const [wsId, posts] of Object.entries(byWorkspace)) {
          const wsProfileKey = await getWorkspaceProfileKey(wsId);
          if (!wsProfileKey) continue;

          try {
            const historyRes = await axios.get(`${BASE_AYRSHARE}/history`, {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
                "Profile-Key": wsProfileKey
              },
              timeout: 15000
            });

            const history = historyRes.data?.history || [];
            const historyMap = {};
            history.forEach(h => { historyMap[h.id] = h; });

            for (const post of posts) {
              const ayrPost = historyMap[post.ayr_post_id];
              if (!ayrPost) continue;

              // Check for platform delivery errors
              const deliveryErrors = Array.isArray(ayrPost.errors)
                ? ayrPost.errors.filter(e => e.status === 'error' || e.code)
                : [];

              if (deliveryErrors.length > 0 || ayrPost.status === 'error') {
                const errorMessages = deliveryErrors.length > 0
                  ? deliveryErrors.map(e =>
                      `${e.platform || 'unknown'}: ${e.message || 'Delivery failed'}`
                    ).join('; ')
                  : 'Post delivery failed on platform';

                // Check if any platform actually succeeded
                const successfulPlatforms = Array.isArray(ayrPost.postIds)
                  ? ayrPost.postIds.filter(p => p && (p.postUrl || p.status === 'success'))
                  : [];

                if (successfulPlatforms.length === 0) {
                  // Complete delivery failure
                  console.log(`[Scheduler] Reverse reconciliation: Post ${post.id} failed delivery: ${errorMessages}`);

                  await supabase
                    .from('posts')
                    .update({ status: 'failed', last_error: errorMessages })
                    .eq('id', post.id);

                  sendPostFailedNotification(supabase, {
                    postId: post.id,
                    workspaceId: post.workspace_id,
                    createdByUserId: post.created_by || post.user_id,
                    platforms: post.platforms,
                    errorMessage: errorMessages
                  }).catch(err => logError('scheduler.reverseRecon.notification', err, { postId: post.id }));

                  await invalidateWorkspaceCache(wsId);
                  reverseReconciled++;
                } else {
                  // Partial failure — some platforms delivered, some failed
                  console.log(`[Scheduler] Reverse reconciliation: Post ${post.id} partial failure: ${errorMessages}`);
                  await supabase
                    .from('posts')
                    .update({ last_error: `Partial: ${errorMessages}` })
                    .eq('id', post.id);
                }
              }
            }
          } catch (histErr) {
            console.warn(`[Scheduler] Reverse reconciliation: Failed to check workspace ${wsId}:`, histErr.message);
          }
        }

        if (reverseReconciled > 0) {
          console.log(`[Scheduler] Reverse reconciliation: Found ${reverseReconciled} posts with delivery failures`);
        }
      }
    } catch (reverseErr) {
      console.warn('[Scheduler] Reverse reconciliation error (non-blocking):', reverseErr.message);
    }

    return sendSuccess(res, {
      processed: (duePosts || []).length,
      successful: results.success.length,
      failed: results.failed.length,
      reconciled,
      reverseReconciled,
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
