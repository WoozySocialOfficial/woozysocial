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
const { sendPostScheduledNotification, sendApprovalRequestNotification, sendPostUpdatedNotification } = require("./notifications/helpers");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

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

    const { text, networks, scheduledDate, userId, workspaceId, postId } = body;
    let { mediaUrl } = body;
    let mediaUrls = [];

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

      console.log('[post] Workspace owner tier:', tier, '| Tier has approval:', tierHasApproval, '| Has clients:', hasClients, '| Requires approval:', requiresApproval);

    // If approval required, save as pending_approval
    if (requiresApproval) {
      if (!supabase) {
        return sendError(res, "Database service is required for scheduled posts", ErrorCodes.CONFIG_ERROR);
      }

      // Check if this is an UPDATE to an existing post (editing a scheduled post)
      if (postId) {
        console.log('[post] Updating existing post:', postId);

        const { data: updatedPost, error: updateError } = await supabase
          .from("posts")
          .update({
            caption: text,
            media_urls: mediaUrls || [],
            scheduled_at: new Date(scheduledDate).toISOString(),
            platforms: platforms,
            approval_status: 'pending', // Reset for re-approval
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

        // Send notifications in parallel to avoid timeout
        if (workspaceId) {
          await Promise.all([
            sendApprovalRequestNotification(supabase, {
              workspaceId,
              postId: updatedPost.id,
              platforms,
              createdByUserId: userId
            }).catch(err => logError('post.notification.approvalRequest', err, { postId: updatedPost.id })),
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
          approval_status: 'pending',
          requires_approval: true
        }]).select().single();

        if (saveError) {
          logError('post.save_pending', saveError, { userId, workspaceId });
          return sendError(res, "Failed to save post for approval", ErrorCodes.DATABASE_ERROR);
        }

        // Send notifications in parallel to avoid timeout
        if (workspaceId) {
          await Promise.all([
            sendApprovalRequestNotification(supabase, {
              workspaceId,
              postId: savedPost?.id,
              platforms,
              createdByUserId: userId
            }).catch(err => logError('post.notification.approvalRequest', err, { postId: savedPost?.id })),
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
        message: 'Post scheduled and awaiting approval',
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
          requires_approval: false
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

      // Check multiple indicators that the post actually succeeded
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
        console.log('[POST] Post succeeded despite HTTP 400 error - status:', responseData?.status, 'ayr_post_id:', ayrPostId);

        if (supabase) {
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
            requires_approval: false
          };

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

        // Return success even though Ayrshare returned HTTP 400
        return sendSuccess(res, {
          status: isScheduled ? 'scheduled' : 'posted',
          postId: ayrPostId,
          platforms: platforms,
          warning: 'Post succeeded (Ayrshare returned HTTP 400 with success body)'
        });
      }

      // No post ID found - post actually failed
      // Save failed post to database
      if (supabase) {
        const { error: dbErr } = await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrls || [],
          status: 'failed',
          scheduled_at: scheduledDate ? new Date(scheduledDate).toISOString() : null,
          platforms: platforms,
          last_error: axiosError.response?.data?.message || axiosError.message
        }]);
        if (dbErr) logError('post.save_failed', dbErr);
      }

      // Include actual Ayrshare error in the response for better debugging
      // Ayrshare can return errors in different formats
      let ayrshareError = responseData?.message
        || responseData?.error
        || (responseData?.errors ? JSON.stringify(responseData.errors) : null)
        || (typeof responseData === 'string' ? responseData : null)
        || (responseData ? JSON.stringify(responseData) : null)
        || axiosError.message;

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
        const { error: dbErr } = await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrls || [],
          status: 'failed',
          scheduled_at: scheduledDate ? new Date(scheduledDate).toISOString() : null,
          platforms: platforms,
          last_error: response.data.message || 'Post failed'
        }]);
        if (dbErr) logError('post.save_failed', dbErr);
      }

      return sendError(
        res,
        response.data.message || "Failed to post to social platforms",
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
        requires_approval: false
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
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
