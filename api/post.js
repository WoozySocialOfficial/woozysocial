const axios = require("axios");
const Busboy = require("busboy");
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
  isServiceConfigured,
  invalidateWorkspaceCache
} = require("./_utils");
const { hasFeature } = require("./_utils-access-control");
const { sendPostScheduledNotification, sendApprovalRequestNotification, sendFinalApprovalRequestNotification, sendPostUpdatedNotification, sendPostFailedNotification } = require("./notifications/helpers");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * Map known Ayrshare error messages to short, user-friendly messages.
 */
function friendlyErrorMessage(rawMsg, platform) {
  const lower = rawMsg.toLowerCase();
  if (lower.includes('media error') || lower.includes('image or video could not be processed')) {
    const name = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'This platform';
    return `${name} requires an image or video to publish this post.`;
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (lower.includes('token') || lower.includes('unauthorized') || lower.includes('authentication')) {
    const name = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Your account';
    return `${name} needs to be reconnected. Go to Social Accounts to reconnect.`;
  }
  if (lower.includes('duplicate')) {
    return 'This content was already posted. Try changing the text.';
  }
  // Strip Ayrshare docs URL and return cleaned message
  let cleaned = rawMsg.replace(/\s*https?:\/\/www\.ayrshare\.com\S*/gi, '').trim();
  return platform ? `${cleaned} (${platform})` : cleaned;
}

/**
 * Extract a clean, human-readable error message from Ayrshare's response.
 * Ayrshare can nest errors in: data.message, data.posts[].errors[].message, data.errors[].message
 */
function extractAyrshareErrorMessage(data) {
  if (!data) return null;

  // Direct message field
  if (data.message && typeof data.message === 'string') return friendlyErrorMessage(data.message);
  if (data.error && typeof data.error === 'string') return friendlyErrorMessage(data.error);

  // Nested in posts array: posts[0].errors[0].message
  if (Array.isArray(data.posts)) {
    for (const post of data.posts) {
      if (Array.isArray(post?.errors)) {
        const messages = post.errors
          .filter(e => e?.message)
          .map(e => friendlyErrorMessage(e.message, e.platform));
        if (messages.length > 0) return messages.join('. ');
      }
    }
  }

  // Direct errors array
  if (Array.isArray(data.errors)) {
    const messages = data.errors
      .filter(e => e?.message)
      .map(e => friendlyErrorMessage(e.message, e.platform));
    if (messages.length > 0) return messages.join('. ');
  }

  return null;
}

// Parse FormData using busboy (works with Vercel serverless)
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = {};
    const busboy = Busboy({ headers: req.headers });

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (fieldname, file, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];

      file.on('data', (data) => {
        chunks.push(data);
      });

      file.on('end', () => {
        const fileObj = {
          buffer: Buffer.concat(chunks),
          filename,
          encoding,
          mimeType
        };

        // Support multiple files for 'media' field
        if (fieldname === 'media') {
          if (!files.media) {
            files.media = [];
          }
          files.media.push(fileObj);
        } else {
          files[fieldname] = fileObj;
        }
      });
    });

    busboy.on('finish', () => {
      resolve({ fields, files });
    });

    busboy.on('error', reject);

    req.pipe(busboy);
  });
}

// Parse raw body for JSON (works with Vercel serverless)
function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Helper to check if workspace has client members
// Used to determine if scheduled posts require client approval before going out
async function workspaceHasClients(supabase, workspaceId) {
  if (!workspaceId) return false;

  try {
    // Check for both 'view_only' and 'client' roles (database may use either)
    const { data: clients } = await supabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', workspaceId)
      .in('role', ['client', 'view_only'])
      .limit(1);

    console.log(`[workspaceHasClients] workspaceId: ${workspaceId}, clients found:`, clients?.length || 0);

    return clients && clients.length > 0;
  } catch (error) {
    logError('workspaceHasClients', error, { workspaceId });
    return false;
  }
}

// Helper to check if workspace has final approvers
// Used to determine if posts need internal review before client approval
async function workspaceHasFinalApprovers(supabase, workspaceId) {
  if (!workspaceId) return false;

  try {
    const { data: finalApprovers } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('can_final_approval', true)
      .limit(1);

    console.log(`[workspaceHasFinalApprovers] workspaceId: ${workspaceId}, final approvers found:`, finalApprovers?.length || 0);

    return finalApprovers && finalApprovers.length > 0;
  } catch (error) {
    logError('workspaceHasFinalApprovers', error, { workspaceId });
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

// Upload media file to Supabase Storage and return public URL
async function uploadMediaToStorage(supabase, file, userId, workspaceId) {
  try {
    if (!file || !file.buffer) {
      return { success: false, error: 'No file provided' };
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.filename.split('.').pop();
    const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${workspaceId || userId}/${timestamp}-${sanitizedFilename}`;

    console.log(`[uploadMediaToStorage] Uploading file: ${storagePath}, size: ${file.buffer.length} bytes, type: ${file.mimeType}`);

    // Upload to Supabase Storage bucket 'post-media'
    const { data, error } = await supabase.storage
      .from('post-media')
      .upload(storagePath, file.buffer, {
        contentType: file.mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      logError('uploadMediaToStorage', error, { storagePath, mimeType: file.mimeType });
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('post-media')
      .getPublicUrl(storagePath);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      return { success: false, error: 'Failed to generate public URL' };
    }

    console.log(`[uploadMediaToStorage] Successfully uploaded: ${publicUrlData.publicUrl}`);

    return {
      success: true,
      publicUrl: publicUrlData.publicUrl,
      storagePath
    };
  } catch (error) {
    logError('uploadMediaToStorage', error);
    return { success: false, error: error.message };
  }
}

module.exports = async function handler(req, res) {
  setCors(res, req);

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
    console.log('[POST] Request received:', {
      method: req.method,
      contentType: req.headers['content-type']
    });

    const contentType = req.headers['content-type'] || '';
    let body = {};
    let uploadedFiles = {};

    // Handle both JSON and FormData (bodyParser is disabled)
    if (contentType.includes('multipart/form-data')) {
      console.log('[POST] Parsing FormData...');
      // Parse FormData with busboy
      const { fields, files } = await parseFormData(req);
      body = fields;
      uploadedFiles = files;
      console.log('[POST] FormData parsed:', {
        fieldKeys: Object.keys(fields),
        fileKeys: Object.keys(files)
      });
    } else {
      console.log('[POST] Parsing JSON body...');
      // Parse JSON
      body = await parseRawBody(req);
      console.log('[POST] JSON parsed, keys:', Object.keys(body));
    }

    const { text, networks, scheduledDate, userId, workspaceId, postId, postSettings } = body;
    let { mediaUrl } = body;
    let mediaUrls = [];

    // Parse postSettings (Phase 4)
    let settings = {};
    if (postSettings) {
      if (typeof postSettings === 'string') {
        try {
          settings = JSON.parse(postSettings);
        } catch (e) {
          console.error('[POST] Failed to parse postSettings:', e);
        }
      } else {
        settings = postSettings;
      }
    }
    console.log('[POST] Post settings parsed:', settings);

    console.log('[POST] Extracted params:', {
      hasText: !!text,
      hasNetworks: !!networks,
      hasScheduledDate: !!scheduledDate,
      userId,
      workspaceId,
      postId,
      hasMediaUrl: !!mediaUrl,
      hasUploadedFiles: !!uploadedFiles.media
    });

    // If files were uploaded, upload to Supabase Storage first (in parallel for speed)
    if (uploadedFiles.media) {
      const filesToUpload = Array.isArray(uploadedFiles.media)
        ? uploadedFiles.media
        : [uploadedFiles.media];

      console.log('[post] File upload detected:', filesToUpload.length, 'file(s)');

      // Upload all files in parallel to avoid timeout
      const uploadPromises = filesToUpload.map(file =>
        uploadMediaToStorage(supabase, file, userId, workspaceId)
      );

      const uploadResults = await Promise.all(uploadPromises);

      // Check for any failures
      for (let i = 0; i < uploadResults.length; i++) {
        const uploadResult = uploadResults[i];
        const file = filesToUpload[i];

        if (!uploadResult.success) {
          return sendError(
            res,
            `Failed to upload ${file.filename}: ${uploadResult.error}`,
            ErrorCodes.EXTERNAL_API_ERROR
          );
        }

        mediaUrls.push(uploadResult.publicUrl);
        console.log('[post] File uploaded successfully:', uploadResult.publicUrl);
      }

      console.log('[post] All media uploaded:', mediaUrls.length, 'file(s)');
    }

    // Parse mediaUrl from body (for non-file uploads or existing URLs)
    if (mediaUrl) {
      const existingUrls = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];
      mediaUrls = [...mediaUrls, ...existingUrls];
    }

    // Validate required fields
    console.log('[POST] Validating required fields...');
    const validation = validateRequired(body, ['text', 'networks', 'userId']);
    if (!validation.valid) {
      console.error('[POST] Validation failed:', validation.missing);
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }
    console.log('[POST] Required fields validated');

    // Parse and validate networks
    console.log('[POST] Parsing networks:', networks);
    const { valid: networksValid, platforms, error: networksError } = parseNetworks(networks);
    if (!networksValid) {
      console.error('[POST] Networks validation failed:', networksError);
      return sendError(res, networksError, ErrorCodes.VALIDATION_ERROR);
    }

    if (platforms.length === 0) {
      console.error('[POST] No platforms selected');
      return sendError(res, "At least one social platform must be selected", ErrorCodes.VALIDATION_ERROR);
    }
    console.log('[POST] Platforms selected:', platforms);

    // Validate text length
    if (text.length > 5000) {
      console.error('[POST] Text too long:', text.length);
      return sendError(res, "Post text exceeds maximum length of 5000 characters", ErrorCodes.VALIDATION_ERROR);
    }

    const isScheduled = !!scheduledDate;
    console.log('[POST] Is scheduled:', isScheduled, '| Has supabase:', !!supabase, '| scheduledDate:', scheduledDate);

    // For ALL scheduled posts, save to DB and let the scheduler handle Ayrshare
    // This avoids timeout issues when Ayrshare takes too long to process media
    if (isScheduled && supabase) {
      console.log('[POST] Entering scheduled post flow - will save to DB and return immediately');
      // Check if approval is required - either by tier feature OR if workspace has clients
      let requiresApproval = false;
      let tier = 'free';

      if (workspaceId) {
        // Get workspace owner's tier
        const { data: workspace } = await supabase
          .from('workspaces')
          .select('owner_id')
          .eq('id', workspaceId)
          .single();

        if (workspace?.owner_id) {
          const { data: ownerProfile } = await supabase
            .from('user_profiles')
            .select('subscription_tier')
            .eq('id', workspace.owner_id)
            .single();

          tier = ownerProfile?.subscription_tier || 'free';
        }
      } else {
        // Fallback: If no workspace, check current user's tier
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('subscription_tier')
          .eq('id', userId)
          .single();

        tier = userProfile?.subscription_tier || 'free';
      }

      const tierHasApproval = hasFeature(tier, 'approvalWorkflows');

      // Check if workspace has clients - if so, require approval for client review
      const hasClients = workspaceId ? await workspaceHasClients(supabase, workspaceId) : false;

      // Require approval if tier has the feature OR if workspace has clients
      requiresApproval = tierHasApproval || hasClients;

      // Check if workspace has final approvers for internal review layer
      const hasFinalApprovers = workspaceId ? await workspaceHasFinalApprovers(supabase, workspaceId) : false;

      console.log('[post] Workspace owner tier:', tier, '| Tier has approval:', tierHasApproval, '| Has clients:', hasClients, '| Has final approvers:', hasFinalApprovers, '| Requires approval:', requiresApproval);

    // If approval required, save as pending_approval
    if (requiresApproval) {
      if (!supabase) {
        return sendError(res, "Database service is required for scheduled posts", ErrorCodes.CONFIG_ERROR);
      }

      // Check if this is an UPDATE to an existing post (editing a scheduled post)
      if (postId) {
        console.log('[post] Updating existing post:', postId);

        // Determine initial approval status for update
        const updateApprovalStatus = hasFinalApprovers ? 'pending_internal' : 'pending';

        const { data: updatedPost, error: updateError } = await supabase
          .from("posts")
          .update({
            caption: text,
            media_urls: mediaUrls || [],
            scheduled_at: new Date(scheduledDate).toISOString(),
            platforms: platforms,
            approval_status: updateApprovalStatus, // Reset for re-approval with correct status
            post_settings: settings, // Phase 4: Save post settings
            updated_at: new Date().toISOString()
          })
          .eq('id', postId)
          .eq('workspace_id', workspaceId)
          .select()
          .single();

        if (updateError) {
          logError('post.update_pending', updateError, { postId, userId, workspaceId });
          return sendError(res, "Failed to update post", ErrorCodes.DATABASE_ERROR);
        }

        console.log('[post] Post updated successfully:', updatedPost.id);

        // Get user info for notifications
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('full_name, email')
          .eq('id', userId)
          .single();

        const updatedByName = userProfile?.full_name || userProfile?.email || 'Someone';

        // Send notifications based on approval workflow
        if (workspaceId) {
          // Send notification to appropriate reviewers
          const approvalNotificationPromise = hasFinalApprovers
            ? sendFinalApprovalRequestNotification(supabase, {
                workspaceId,
                postId: updatedPost.id,
                platforms,
                createdByUserId: userId
              }).catch(err => logError('post.notification.finalApprovalRequest', err, { postId: updatedPost.id }))
            : sendApprovalRequestNotification(supabase, {
                workspaceId,
                postId: updatedPost.id,
                platforms,
                createdByUserId: userId
              }).catch(err => logError('post.notification.approvalRequest', err, { postId: updatedPost.id }));

          await Promise.all([
            approvalNotificationPromise,
            sendPostUpdatedNotification(supabase, {
              postId: updatedPost.id,
              workspaceId,
              updatedByUserId: userId,
              updatedByName
            }).catch(err => logError('post.notification.postUpdated', err, { postId: updatedPost.id }))
          ]);
        }

        // Invalidate cache after updating post
        await invalidateWorkspaceCache(workspaceId);

        return sendSuccess(res, {
          status: 'updated',
          postId: updatedPost.id,
          message: 'Post updated and awaiting approval'
        });
      }

      // Determine initial approval status based on workspace configuration
      const initialApprovalStatus = hasFinalApprovers ? 'pending_internal' : 'pending';

      // Otherwise, CREATE a new post
      const { data: savedPost, error: saveError } = await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrls || [],
          status: 'pending_approval',
          scheduled_at: new Date(scheduledDate).toISOString(),
          platforms: platforms,
          approval_status: initialApprovalStatus,
          requires_approval: true,
          post_settings: settings // Phase 4: Save post settings
        }]).select().single();

        if (saveError) {
          logError('post.save_pending', saveError, { userId, workspaceId });
          return sendError(res, "Failed to save post for approval", ErrorCodes.DATABASE_ERROR);
        }

        // Send notifications based on approval workflow
        if (workspaceId) {
          // Send notification to appropriate reviewers
          const approvalNotificationPromise = hasFinalApprovers
            ? sendFinalApprovalRequestNotification(supabase, {
                workspaceId,
                postId: savedPost?.id,
                platforms,
                createdByUserId: userId
              }).catch(err => logError('post.notification.finalApprovalRequest', err, { postId: savedPost?.id }))
            : sendApprovalRequestNotification(supabase, {
                workspaceId,
                postId: savedPost?.id,
                platforms,
                createdByUserId: userId
              }).catch(err => logError('post.notification.approvalRequest', err, { postId: savedPost?.id }));

          await Promise.all([
            approvalNotificationPromise,
            sendPostScheduledNotification(supabase, {
              postId: savedPost?.id,
              workspaceId,
              scheduledAt: scheduledDate,
              platforms,
              createdByUserId: userId
            }).catch(err => logError('post.notification.scheduled', err, { postId: savedPost?.id }))
          ]);
        }

      // Invalidate cache after creating post pending approval
      await invalidateWorkspaceCache(workspaceId);

      return sendSuccess(res, {
        status: 'pending_approval',
        approval_status: initialApprovalStatus,
        message: hasFinalApprovers
          ? 'Post submitted for internal review'
          : 'Post scheduled and awaiting approval',
        postId: savedPost?.id
      });
    } else {
      // Scheduled post without approval - save to DB and let scheduler handle it
      // This avoids timeout issues with Ayrshare processing media

      // Check if this is an UPDATE to an existing post
      if (postId) {
        console.log('[post] Updating existing scheduled post:', postId);

        const { data: updatedPost, error: updateError } = await supabase
          .from("posts")
          .update({
            caption: text,
            media_urls: mediaUrls || [],
            scheduled_at: new Date(scheduledDate).toISOString(),
            platforms: platforms,
            status: 'scheduled',
            approval_status: 'approved',
            post_settings: settings, // Phase 4: Save post settings
            updated_at: new Date().toISOString()
          })
          .eq('id', postId)
          .eq('workspace_id', workspaceId)
          .select()
          .single();

        if (updateError) {
          logError('post.update_scheduled', updateError, { postId, userId, workspaceId });
          return sendError(res, "Failed to update scheduled post", ErrorCodes.DATABASE_ERROR);
        }

        console.log('[post] Scheduled post updated successfully:', updatedPost.id);

        // Invalidate cache after updating scheduled post
        await invalidateWorkspaceCache(workspaceId);

        return sendSuccess(res, {
          status: 'scheduled',
          postId: updatedPost.id,
          message: 'Post scheduled successfully'
        });
      }

      // Otherwise, CREATE a new scheduled post
      console.log('[post] Creating new scheduled post - NOT calling Ayrshare, scheduler will handle it');
      console.log('[post] Media URLs to save:', mediaUrls);
      const { data: savedPost, error: saveError } = await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrls || [],
          status: 'scheduled',
          scheduled_at: new Date(scheduledDate).toISOString(),
          platforms: platforms,
          approval_status: 'approved',
          requires_approval: false,
          post_settings: settings // Phase 4: Save post settings
        }]).select().single();

        if (saveError) {
          console.error('[post] Database save error:', saveError);
          logError('post.save_scheduled', saveError, { userId, workspaceId });
          return sendError(res, `Failed to save scheduled post: ${saveError.message}`, ErrorCodes.DATABASE_ERROR);
        }

        console.log('[post] Scheduled post saved successfully:', savedPost?.id);

        // Invalidate cache after creating scheduled post
        await invalidateWorkspaceCache(workspaceId);

        return sendSuccess(res, {
          status: 'scheduled',
          message: 'Post scheduled successfully',
          postId: savedPost?.id
        });
    }
  }

    // For immediate posts (not scheduled), proceed with Ayrshare call
    // Check Ayrshare is configured
    console.log('[POST] Checking Ayrshare configuration...');
    if (!isServiceConfigured('ayrshare')) {
      console.error('[POST] Ayrshare not configured');
      return sendError(res, "Social posting service is not configured", ErrorCodes.CONFIG_ERROR);
    }
    console.log('[POST] Ayrshare configured');

    // Get profile key - check workspace first, then user, then env fallback (matches generate-jwt.js)
    console.log('[POST] Getting profile key for workspaceId:', workspaceId, 'userId:', userId);
    let profileKey;
    if (workspaceId) {
      profileKey = await getWorkspaceProfileKey(workspaceId);
      console.log('[POST] Workspace profile key:', profileKey ? 'FOUND' : 'NOT FOUND');
    }
    if (!profileKey && userId) {
      console.log('[POST] Trying user profile key...');
      profileKey = await getWorkspaceProfileKeyForUser(userId);
      console.log('[POST] User profile key:', profileKey ? 'FOUND' : 'NOT FOUND');
    }
    // Fallback to environment variable (consistent with generate-jwt.js)
    if (!profileKey && process.env.AYRSHARE_PROFILE_KEY) {
      profileKey = process.env.AYRSHARE_PROFILE_KEY;
      console.log('[POST] Using fallback AYRSHARE_PROFILE_KEY from env');
    }

    if (!profileKey) {
      console.error('[POST] No profile key found for workspace, user, or env');
      return sendError(
        res,
        "No social media accounts connected. Please connect your accounts first.",
        ErrorCodes.VALIDATION_ERROR
      );
    }
    console.log('[POST] Using profile key:', profileKey.substring(0, 8) + '...');

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
      // CRITICAL: Ayrshare expects ISO-8601 string format, NOT Unix timestamp!
      // Format: "2025-01-15T14:00:00Z"
      postData.scheduleDate = dateObj.toISOString();
    }

    if (mediaUrls && mediaUrls.length > 0) {
      postData.mediaUrls = mediaUrls;
    }

    // Apply post settings (Phase 4)
    console.log('[POST] Applying post settings...');

    // Auto-shorten links
    if (settings.shortenLinks) {
      postData.shortenLinks = true;
      console.log('[POST] - shortenLinks enabled');
    }

    // Twitter thread options
    const hasTwitter = platforms.some(p => ['twitter', 'x'].includes(p.toLowerCase()));
    if (settings.threadPost && hasTwitter) {
      postData.twitterOptions = {
        thread: true,
        threadNumber: settings.threadNumber !== false
      };
      console.log('[POST] - Twitter thread options:', postData.twitterOptions);
    }

    // Instagram post type options (case-insensitive platform check)
    const hasInstagram = platforms.some(p => p.toLowerCase() === 'instagram');
    if (settings.instagramType && hasInstagram) {
      // Check if media contains videos
      const hasVideo = mediaUrls && mediaUrls.length > 0 && mediaUrls.some(url => {
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        return videoExtensions.some(ext => url.toLowerCase().includes(ext));
      });

      const hasImage = mediaUrls && mediaUrls.length > 0 && mediaUrls.some(url => {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        return imageExtensions.some(ext => url.toLowerCase().includes(ext));
      });

      // Validate mixed media - Instagram doesn't support video + photos in same post
      if (hasVideo && hasImage) {
        console.error('[POST] Mixed media detected (video + photos) - not supported by Instagram');
        return sendError(
          res,
          "Instagram does not support mixing videos and photos in the same post. Please use either videos only or photos only.",
          ErrorCodes.VALIDATION_ERROR
        );
      }

      if (settings.instagramType === 'story') {
        // Instagram Stories have specific dimension requirements
        // Width must be between 320px and 1920px
        // We can't check actual dimensions server-side without downloading the image
        // but we can add a note to the validation
        postData.instagramOptions = { stories: true };
        console.log('[POST] - Instagram Story mode enabled');
        console.log('[POST] - Note: Instagram Stories require image width between 320px and 1920px');
      } else if (settings.instagramType === 'reel') {
        // Only set reel options if not auto-detected
        // Ayrshare auto-detects videos as reels, so we only need to specify if forcing
        postData.instagramOptions = { reels: true, shareReelsFeed: true };
        console.log('[POST] - Instagram Reel mode enabled');
      }
      // 'feed' is default, no special options needed
    }

    // Twitter thread auto-splitting
    if (settings.threadPost && hasTwitter) {
      // Ayrshare breaks threads on double line breaks (\n\n)
      // If any paragraph exceeds 280 chars, auto-split at sentence boundaries
      const paragraphs = text.split('\n\n');
      const processedParagraphs = [];

      for (const paragraph of paragraphs) {
        if (paragraph.length <= 280) {
          // Paragraph is fine, keep as-is
          processedParagraphs.push(paragraph);
        } else {
          // Paragraph too long - split at sentence boundaries
          console.log(`[POST] Auto-splitting long paragraph (${paragraph.length} chars) for thread`);

          // Split on sentence endings (. ! ?) followed by space or newline
          const sentences = paragraph.split(/([.!?])\s+/).filter(s => s.trim().length > 0);

          let currentChunk = '';
          for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];

            // Check if adding this sentence would exceed limit
            if (currentChunk.length + sentence.length + 1 > 280) {
              // Save current chunk if it has content
              if (currentChunk.trim().length > 0) {
                processedParagraphs.push(currentChunk.trim());
                currentChunk = sentence;
              } else {
                // Single sentence is too long, split at word boundaries
                const words = sentence.split(' ');
                let wordChunk = '';
                for (const word of words) {
                  if (wordChunk.length + word.length + 1 > 280) {
                    if (wordChunk.trim().length > 0) {
                      processedParagraphs.push(wordChunk.trim());
                      wordChunk = word;
                    } else {
                      // Single word too long, just add it (truncation handled by Twitter)
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

          // Add final chunk
          if (currentChunk.trim().length > 0) {
            processedParagraphs.push(currentChunk.trim());
          }
        }
      }

      // Rejoin paragraphs with double line breaks
      const processedText = processedParagraphs.join('\n\n');

      if (processedText !== text) {
        console.log(`[POST] Text auto-split for threading: ${paragraphs.length} → ${processedParagraphs.length} paragraphs`);
        postData.post = processedText;
      }
    }

    console.log('[POST] Post settings applied. Final postData:', {
      platforms: postData.platforms,
      hasMedia: !!postData.mediaUrls,
      shortenLinks: postData.shortenLinks,
      twitterOptions: postData.twitterOptions,
      instagramOptions: postData.instagramOptions
    });

    // Send to Ayrshare
    console.log('[POST] Sending to Ayrshare...', {
      endpoint: `${BASE_AYRSHARE}/post`,
      platforms: postData.platforms,
      hasMedia: !!postData.mediaUrls,
      hasSchedule: !!postData.scheduleDate,
      postPreview: postData.post?.substring(0, 50) + '...',
      profileKeyPrefix: profileKey?.substring(0, 8) + '...'
    });
    let response;
    try {
      response = await axios.post(`${BASE_AYRSHARE}/post`, postData, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        },
        timeout: 55000 // 55 second timeout (leave 5s buffer before Vercel kills the function)
      });
      console.log('[POST] Ayrshare response received:', {
        status: response.data?.status,
        id: response.data?.id || response.data?.postId
      });
    } catch (axiosError) {
      console.error('[POST] Ayrshare request failed:', {
        message: axiosError.message,
        status: axiosError.response?.status,
        data: axiosError.response?.data
      });
      logError('post.ayrshare_request', axiosError, { platforms });

      // IMPORTANT: Check if Ayrshare returned success data despite HTTP 400 status
      // Ayrshare has a quirk where it returns HTTP 400 with a success response body
      const responseData = axiosError.response?.data;

      // Log full response for debugging status mismatches
      console.log('[POST] Full error response:', JSON.stringify(responseData));

      // Check multiple indicators that the post actually succeeded
      const isActuallySuccessful = responseData?.status === 'success'
        || (Array.isArray(responseData?.errors) && responseData.errors.length === 0)
        || responseData?.postIds?.length > 0
        || (Array.isArray(responseData?.posts) && responseData.posts.length > 0);

      const ayrPostId = responseData?.postIds?.[0]?.id
        || responseData?.posts?.[0]?.id
        || responseData?.id
        || responseData?.postId
        || responseData?.refId;

      if (isActuallySuccessful) {
        // Post actually succeeded despite HTTP error - save as successful
        console.log('[POST] Post succeeded despite HTTP error - status:', responseData?.status, 'ayr_post_id:', ayrPostId || 'unknown');

        if (supabase) {
          const postRecord = {
            user_id: userId,
            workspace_id: workspaceId,
            created_by: userId,
            caption: text,
            media_urls: mediaUrls || [],
            status: isScheduled ? 'scheduled' : 'posted',
            scheduled_at: isScheduled ? new Date(scheduledDate).toISOString() : null,
            posted_at: isScheduled ? null : new Date().toISOString(),
            platforms: platforms,
            approval_status: 'approved',
            requires_approval: false,
            post_settings: settings
          };
          if (ayrPostId) {
            postRecord.ayr_post_id = ayrPostId;
          }

          const { data: savedPost, error: dbError } = await supabase
            .from("posts")
            .insert([postRecord])
            .select()
            .single();

          if (dbError) {
            console.error('[POST] Database save error:', dbError);
            logError('post.save_success_with_warning', dbError);
          } else {
            console.log('[POST] Post saved as successful despite error response:', savedPost?.id);
          }
        }

        // Invalidate cache
        await invalidateWorkspaceCache(workspaceId);

        // Return success even though Ayrshare returned HTTP error
        return sendSuccess(res, {
          status: isScheduled ? 'scheduled' : 'posted',
          postId: ayrPostId || 'unknown',
          platforms: platforms,
          warning: 'Post succeeded (Ayrshare returned HTTP error with success body)'
        });
      }

      // No post ID found - post actually failed
      // Save failed post to database
      if (supabase) {
        const failureReason = axiosError.response?.data?.message || axiosError.message;
        const { data: savedFailedPost, error: dbErr } = await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrls || [],
          status: 'failed',
          scheduled_at: scheduledDate ? new Date(scheduledDate).toISOString() : null,
          platforms: platforms,
          last_error: failureReason,
          post_settings: settings // Phase 4: Save post settings
        }]).select('id').single();
        if (dbErr) logError('post.save_failed', dbErr);
        sendPostFailedNotification(supabase, {
          postId: savedFailedPost?.id || null,
          workspaceId,
          createdByUserId: userId,
          platforms,
          errorMessage: failureReason
        }).catch(err => logError('post.notification.failed', err));
      }

      // Extract a clean, human-readable error from Ayrshare's response
      let ayrshareError = extractAyrshareErrorMessage(responseData)
        || axiosError.message
        || "Failed to connect to social media service";

      console.error('[POST] Extracted Ayrshare error:', ayrshareError);

      return sendError(
        res,
        ayrshareError || "Failed to connect to social media service",
        ErrorCodes.EXTERNAL_API_ERROR,
        axiosError.response?.data
      );
    }

    if (response.data.status === 'error') {
      // Save failed post to database
      if (supabase) {
        const failureReason = response.data.message || 'Post failed';
        const { data: savedFailedPost, error: dbErr } = await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrls || [],
          status: 'failed',
          scheduled_at: scheduledDate ? new Date(scheduledDate).toISOString() : null,
          platforms: platforms,
          last_error: failureReason,
          post_settings: settings // Phase 4: Save post settings
        }]).select('id').single();
        if (dbErr) logError('post.save_failed', dbErr);
        sendPostFailedNotification(supabase, {
          postId: savedFailedPost?.id || null,
          workspaceId,
          createdByUserId: userId,
          platforms,
          errorMessage: failureReason
        }).catch(err => logError('post.notification.failed', err));
      }

      return sendError(
        res,
        extractAyrshareErrorMessage(response.data) || "Failed to post to social platforms",
        ErrorCodes.EXTERNAL_API_ERROR,
        response.data
      );
    }

    // Save successful post to database
    console.log('[POST] Saving successful post to database...');
    if (supabase) {
      // Ayrshare API returns posts in an array: response.data.posts[0].id
      const ayrPostId = response.data.posts?.[0]?.id || response.data.id || response.data.postId;
      const postRecord = {
        user_id: userId,
        workspace_id: workspaceId,
        created_by: userId,
        ayr_post_id: ayrPostId,
        caption: text,
        media_urls: mediaUrls || [],
        status: isScheduled ? 'scheduled' : 'posted',
        scheduled_at: isScheduled ? new Date(scheduledDate).toISOString() : null,
        posted_at: isScheduled ? null : new Date().toISOString(),
        platforms: platforms,
        approval_status: 'approved',
        requires_approval: false,
        post_settings: settings // Phase 4: Save post settings
      };
      console.log('[POST] Post record to save:', {
        ...postRecord,
        caption: postRecord.caption?.substring(0, 50) + '...'
      });

      const { data: savedPost, error: dbError } = await supabase
        .from("posts")
        .insert([postRecord])
        .select()
        .single();

      if (dbError) {
        console.error('[POST] Database save error:', dbError);
        logError('post.save_success', dbError);
      } else {
        console.log('[POST] Post saved to database:', savedPost?.id);
      }
    }

    console.log('[POST] Returning success response');

    // Invalidate cache after successful post
    await invalidateWorkspaceCache(workspaceId);

    return sendSuccess(res, {
      status: isScheduled ? 'scheduled' : 'posted',
      postId: response.data.posts?.[0]?.id || response.data.id || response.data.postId,
      platforms: platforms,
      ...response.data
    });

  } catch (error) {
    // Enhanced error logging to identify exact failure point
    console.error('=== POST HANDLER ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request method:', req.method);
    console.error('Content-Type:', req.headers['content-type']);
    console.error('Has body:', !!req.body);

    logError('post.handler', error, {
      method: req.method,
      contentType: req.headers['content-type'],
      errorMessage: error.message,
      errorStack: error.stack
    });

    return sendError(
      res,
      `An unexpected error occurred while posting: ${error.message}`,
      ErrorCodes.INTERNAL_ERROR,
      process.env.NODE_ENV !== 'production' ? { stack: error.stack } : null
    );
  }
};

// Disable Vercel's body parser so formidable can parse FormData
// Allow 60 seconds for processing multi-media uploads
module.exports.config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60
};
