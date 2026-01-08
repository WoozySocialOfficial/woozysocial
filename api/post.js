const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  getWorkspaceProfileKeyForUser,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  applyRateLimit,
  isServiceConfigured
} = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

// Helper to check if workspace has client members who need to approve
async function workspaceHasClients(supabase, workspaceId) {
  if (!workspaceId) return false;

  try {
    const { data: clients } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('role', 'view_only')
      .limit(1);

    return clients && clients.length > 0;
  } catch (error) {
    logError('workspaceHasClients', error, { workspaceId });
    return false;
  }
}

// Parse and validate networks
function parseNetworks(networks) {
  try {
    const parsed = typeof networks === 'string' ? JSON.parse(networks) : networks;
    const platforms = Object.entries(parsed)
      .filter(([, value]) => value)
      .map(([key]) => key);
    return { valid: true, platforms };
  } catch (error) {
    return { valid: false, platforms: [], error: 'Invalid networks format' };
  }
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  // Rate limiting: 30 posts per minute per user
  const rateLimited = applyRateLimit(req, res, 'post', { maxRequests: 30, windowMs: 60000 });
  if (rateLimited) return;

  const supabase = getSupabase();

  try {
    const { text, networks, scheduledDate, userId, workspaceId, mediaUrl } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['text', 'networks', 'userId']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Parse and validate networks
    const { valid: networksValid, platforms, error: networksError } = parseNetworks(networks);
    if (!networksValid) {
      return sendError(res, networksError, ErrorCodes.VALIDATION_ERROR);
    }

    if (platforms.length === 0) {
      return sendError(res, "At least one social platform must be selected", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate text length
    if (text.length > 5000) {
      return sendError(res, "Post text exceeds maximum length of 5000 characters", ErrorCodes.VALIDATION_ERROR);
    }

    const isScheduled = !!scheduledDate;

    // Check if workspace has clients who need to approve scheduled posts
    const hasClients = supabase ? await workspaceHasClients(supabase, workspaceId) : false;
    const requiresApproval = isScheduled && hasClients;

    // If scheduled and has clients, save to DB only - wait for approval
    if (requiresApproval) {
      if (supabase) {
        const { data: savedPost, error: saveError } = await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrl ? [mediaUrl] : [],
          status: 'pending_approval',
          scheduled_at: new Date(scheduledDate).toISOString(),
          platforms: platforms,
          approval_status: 'pending',
          requires_approval: true
        }]).select().single();

        if (saveError) {
          logError('post.save_pending', saveError, { userId, workspaceId });
          return sendError(res, "Failed to save post for approval", ErrorCodes.DATABASE_ERROR);
        }

        // Send notification to clients (non-blocking)
        try {
          const notifyUrl = `${req.headers.origin || process.env.APP_URL || ''}/api/notifications/send-approval-request`;
          axios.post(notifyUrl, {
            workspaceId,
            postId: savedPost?.id,
            postCaption: text,
            scheduledAt: scheduledDate,
            platforms
          }).catch(err => logError('post.notification', err, { postId: savedPost?.id }));
        } catch (notifyErr) {
          // Non-blocking, just log
          logError('post.notification_setup', notifyErr);
        }

        return sendSuccess(res, {
          status: 'pending_approval',
          message: 'Post saved and awaiting client approval',
          postId: savedPost?.id
        });
      }
    }

    // Check Ayrshare is configured
    if (!isServiceConfigured('ayrshare')) {
      return sendError(res, "Social posting service is not configured", ErrorCodes.CONFIG_ERROR);
    }

    // Get profile key
    let profileKey;
    if (workspaceId) {
      profileKey = await getWorkspaceProfileKey(workspaceId);
    }
    if (!profileKey && userId) {
      profileKey = await getWorkspaceProfileKeyForUser(userId);
    }

    if (!profileKey) {
      return sendError(
        res,
        "No social media accounts connected. Please connect your accounts first.",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Build post data
    const postData = { post: text, platforms };

    if (scheduledDate) {
      const dateObj = new Date(scheduledDate);
      if (isNaN(dateObj.getTime())) {
        return sendError(res, "Invalid scheduled date format", ErrorCodes.VALIDATION_ERROR);
      }
      if (dateObj.getTime() < Date.now()) {
        return sendError(res, "Scheduled date must be in the future", ErrorCodes.VALIDATION_ERROR);
      }
      const timestampSeconds = Math.floor(dateObj.getTime() / 1000);
      postData.scheduleDate = timestampSeconds;
    }

    if (mediaUrl) {
      postData.mediaUrls = [mediaUrl];
    }

    // Send to Ayrshare
    let response;
    try {
      response = await axios.post(`${BASE_AYRSHARE}/post`, postData, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        },
        timeout: 30000 // 30 second timeout
      });
    } catch (axiosError) {
      logError('post.ayrshare_request', axiosError, { platforms });

      // Save failed post to database
      if (supabase) {
        await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrl ? [mediaUrl] : [],
          status: 'failed',
          scheduled_at: scheduledDate ? new Date(scheduledDate).toISOString() : null,
          platforms: platforms,
          last_error: axiosError.response?.data?.message || axiosError.message
        }]).catch(dbErr => logError('post.save_failed', dbErr));
      }

      return sendError(
        res,
        "Failed to connect to social media service",
        ErrorCodes.EXTERNAL_API_ERROR,
        axiosError.response?.data
      );
    }

    if (response.data.status === 'error') {
      // Save failed post to database
      if (supabase) {
        await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrl ? [mediaUrl] : [],
          status: 'failed',
          scheduled_at: scheduledDate ? new Date(scheduledDate).toISOString() : null,
          platforms: platforms,
          last_error: response.data.message || 'Post failed'
        }]).catch(dbErr => logError('post.save_failed', dbErr));
      }

      return sendError(
        res,
        response.data.message || "Failed to post to social platforms",
        ErrorCodes.EXTERNAL_API_ERROR,
        response.data
      );
    }

    // Save successful post to database
    if (supabase) {
      const ayrPostId = response.data.id || response.data.postId;
      await supabase.from("posts").insert([{
        user_id: userId,
        workspace_id: workspaceId,
        created_by: userId,
        ayr_post_id: ayrPostId,
        caption: text,
        media_urls: mediaUrl ? [mediaUrl] : [],
        status: isScheduled ? 'scheduled' : 'posted',
        scheduled_at: isScheduled ? new Date(scheduledDate).toISOString() : null,
        posted_at: isScheduled ? null : new Date().toISOString(),
        platforms: platforms,
        approval_status: 'approved',
        requires_approval: false
      }]).catch(dbErr => logError('post.save_success', dbErr));
    }

    return sendSuccess(res, {
      status: isScheduled ? 'scheduled' : 'posted',
      postId: response.data.id || response.data.postId,
      platforms: platforms,
      ...response.data
    });

  } catch (error) {
    logError('post.handler', error, { method: req.method });

    // Try to save error to database
    if (supabase) {
      try {
        const { text, networks, scheduledDate, userId, workspaceId, mediaUrl } = req.body || {};
        const { platforms } = parseNetworks(networks || '{}');

        await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrl ? [mediaUrl] : [],
          status: 'failed',
          scheduled_at: scheduledDate ? new Date(scheduledDate).toISOString() : null,
          platforms: platforms,
          last_error: error.message
        }]);
      } catch (dbErr) {
        logError('post.save_error', dbErr);
      }
    }

    return sendError(res, "An unexpected error occurred while posting", ErrorCodes.INTERNAL_ERROR);
  }
};
