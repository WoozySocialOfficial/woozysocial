const axios = require("axios");
const { sendApprovalNotification, sendNewCommentNotification } = require("../notifications/helpers");
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
const {
  verifyWorkspaceMembership,
  checkPermission,
  hasFeature
} = require("../_utils-access-control");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

// Helper to send post to Ayrshare
async function sendToAyrshare(post, profileKey) {
  const postData = {
    post: post.caption,
    platforms: post.platforms
  };

  // Check if scheduled time is in the future
  if (post.scheduled_at) {
    const scheduledTime = new Date(post.scheduled_at);
    const now = new Date();

    console.log('[sendToAyrshare] Schedule check:', {
      scheduled_at_raw: post.scheduled_at,
      scheduledTime: scheduledTime.toISOString(),
      now: now.toISOString(),
      isInFuture: scheduledTime > now,
      diffMs: scheduledTime.getTime() - now.getTime()
    });

    if (scheduledTime > now) {
      // Schedule for future - MUST use ISO-8601 string format, NOT Unix timestamp!
      postData.scheduleDate = scheduledTime.toISOString();
      console.log('[sendToAyrshare] Adding scheduleDate:', postData.scheduleDate);
    } else {
      console.log('[sendToAyrshare] Scheduled time has passed, posting immediately');
    }
  } else {
    console.log('[sendToAyrshare] No scheduled_at found on post');
  }

  // Handle media URLs - ensure they are valid URLs
  if (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0) {
    // Filter out any empty/null values and ensure URLs are strings
    const validMediaUrls = post.media_urls
      .filter(url => url && typeof url === 'string' && url.trim() !== '')
      .map(url => url.trim());

    if (validMediaUrls.length > 0) {
      postData.mediaUrls = validMediaUrls;
    }
  }

  console.log('[sendToAyrshare] Sending post data:', JSON.stringify(postData, null, 2));

  const response = await axios.post(`${BASE_AYRSHARE}/post`, postData, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      "Profile-Key": profileKey
    },
    timeout: 30000
  });

  return response.data;
}

const VALID_ACTIONS = ['approve', 'reject', 'changes_requested', 'mark_resolved'];

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  // POST - Approve, reject, or request changes
  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { postId, workspaceId, userId, action, comment } = body;

      // Validate required fields
      const validation = validateRequired(body, ['postId', 'workspaceId', 'userId', 'action']);
      if (!validation.valid) {
        return sendError(
          res,
          `Missing required fields: ${validation.missing.join(', ')}`,
          ErrorCodes.VALIDATION_ERROR
        );
      }

      if (!isValidUUID(postId) || !isValidUUID(workspaceId) || !isValidUUID(userId)) {
        return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
      }

      if (!VALID_ACTIONS.includes(action)) {
        return sendError(
          res,
          `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
          ErrorCodes.VALIDATION_ERROR
        );
      }

      // Verify workspace membership
      const membershipCheck = await verifyWorkspaceMembership(supabase, userId, workspaceId);
      if (!membershipCheck.success) {
        return sendError(res, membershipCheck.error, ErrorCodes.FORBIDDEN);
      }

      const member = membershipCheck.member;

      // Check if user has permission based on the action
      // For 'mark_resolved', editors can do it (they're just marking changes as done)
      // For approve/reject/changes_requested, only admins and clients can do it
      if (action === 'mark_resolved') {
        // Editors, admins, and clients can mark changes as resolved
        const canEdit = checkPermission(member, 'canEditPosts');
        if (!canEdit.success) {
          return sendError(res, "You don't have permission to mark changes as resolved", ErrorCodes.FORBIDDEN);
        }
      } else {
        // For actual approval actions, only admins and clients
        const permissionCheck = checkPermission(member, 'canApprovePosts');
        if (!permissionCheck.success) {
          return sendError(res, "Only admins and clients can approve posts", ErrorCodes.FORBIDDEN);
        }
      }

      // Check if approval workflows are enabled for this workspace
      // Get the WORKSPACE OWNER's subscription tier (not the approving client's)
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('owner_id')
        .eq('id', workspaceId)
        .single();

      const { data: ownerProfile } = await supabase
        .from('user_profiles')
        .select('subscription_tier')
        .eq('id', workspace?.owner_id)
        .single();

      const tier = ownerProfile?.subscription_tier || 'free';

      // If the current user is a client, they can approve (they ARE the client, so approval workflow is valid)
      // This is the most reliable check - if a client has access to approve, workflows must be enabled
      const userIsClient = member.role === 'client';

      // Also check if workspace has other clients
      const { data: clients } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .in('role', ['client', 'view_only'])
        .limit(1);

      const hasClients = clients && clients.length > 0;

      // Allow approval if:
      // 1. User is a client (if they're a client with approval access, workflows are valid)
      // 2. OR tier has the approvalWorkflows feature
      // 3. OR workspace has clients (clients viewing means approval was required)
      if (!userIsClient && !hasFeature(tier, 'approvalWorkflows') && !hasClients) {
        return sendError(
          res,
          "Approval workflows are not available on your subscription tier. Please upgrade to Pro Plus or Agency to access this feature.",
          ErrorCodes.FORBIDDEN
        );
      }

      // Map action to status
      const statusMap = {
        'approve': 'approved',
        'reject': 'rejected',
        'changes_requested': 'changes_requested',
        'mark_resolved': 'pending' // Transitions back to pending for re-approval
      };
      const newStatus = statusMap[action];

      // Update or create post approval record
      const { data: existingApproval, error: approvalError } = await supabase
        .from('post_approvals')
        .select('id')
        .eq('post_id', postId)
        .single();

      if (approvalError && approvalError.code !== 'PGRST116') {
        logError('post.approve.checkApproval', approvalError, { postId });
      }

      const approvalData = {
        approval_status: newStatus,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (existingApproval) {
        const { error: updateError } = await supabase
          .from('post_approvals')
          .update(approvalData)
          .eq('id', existingApproval.id);

        if (updateError) {
          logError('post.approve.updateApproval', updateError, { approvalId: existingApproval.id });
        }
      } else {
        const { error: insertError } = await supabase
          .from('post_approvals')
          .insert({
            post_id: postId,
            workspace_id: workspaceId,
            ...approvalData
          });

        if (insertError) {
          logError('post.approve.insertApproval', insertError, { postId, workspaceId });
        }
      }

      // Update the post's approval_status
      const { error: postUpdateError } = await supabase
        .from('posts')
        .update({ approval_status: newStatus })
        .eq('id', postId);

      if (postUpdateError) {
        logError('post.approve.updatePost', postUpdateError, { postId });
      }

      // If approved, send the post to Ayrshare
      if (action === 'approve') {
        // Get the post data
        const { data: post, error: postError } = await supabase
          .from('posts')
          .select('*')
          .eq('id', postId)
          .single();

        if (postError) {
          logError('post.approve.getPost', postError, { postId });
          return sendError(res, "Failed to fetch post data", ErrorCodes.DATABASE_ERROR);
        }

        if (post && post.status === 'pending_approval') {
          // Get workspace profile key with env fallback
          let profileKey = await getWorkspaceProfileKey(workspaceId);
          if (!profileKey && process.env.AYRSHARE_PROFILE_KEY) {
            profileKey = process.env.AYRSHARE_PROFILE_KEY;
          }

          if (!profileKey) {
            return sendError(
              res,
              "No social media profile found for this workspace",
              ErrorCodes.VALIDATION_ERROR
            );
          }

          try {
            const ayrshareResponse = await sendToAyrshare(post, profileKey);

            console.log('[approve] Ayrshare response:', JSON.stringify(ayrshareResponse, null, 2));

            if (ayrshareResponse.status !== 'error') {
              // Update post with Ayrshare ID and new status
              // Ayrshare returns ID in posts array
              const ayrPostId = ayrshareResponse.posts?.[0]?.id || ayrshareResponse.id || ayrshareResponse.postId;
              const scheduledTime = new Date(post.scheduled_at);
              const now = new Date();
              const isStillFuture = scheduledTime > now;

              console.log('[approve] Extracted ayrPostId:', ayrPostId, 'isStillFuture:', isStillFuture);

              if (!ayrPostId) {
                console.error('[approve] WARNING: No post ID returned from Ayrshare!', ayrshareResponse);
              }

              await supabase
                .from('posts')
                .update({
                  ayr_post_id: ayrPostId || null,
                  status: isStillFuture ? 'scheduled' : 'posted',
                  posted_at: isStillFuture ? null : new Date().toISOString()
                })
                .eq('id', postId);
            } else {
              // Ayrshare returned error
              await supabase
                .from('posts')
                .update({
                  status: 'failed',
                  last_error: ayrshareResponse.message || 'Failed to post to Ayrshare'
                })
                .eq('id', postId);

              return sendError(
                res,
                "Failed to post to social platforms",
                ErrorCodes.EXTERNAL_API_ERROR,
                ayrshareResponse
              );
            }
          } catch (ayrError) {
            logError('post.approve.ayrshare', ayrError, { postId, workspaceId });

            // Failed to send to Ayrshare
            await supabase
              .from('posts')
              .update({
                status: 'failed',
                last_error: ayrError.response?.data?.message || ayrError.message
              })
              .eq('id', postId);

            return sendError(
              res,
              "Failed to send post to social platforms",
              ErrorCodes.EXTERNAL_API_ERROR,
              ayrError.response?.data
            );
          }
        }
      }

      // Add system comment if provided or create default one
      const systemComment = comment ||
        `Post ${
          action === 'approve' ? 'approved' :
          action === 'reject' ? 'rejected' :
          action === 'changes_requested' ? 'marked for changes' :
          action === 'mark_resolved' ? 'changes resolved - ready for re-approval' :
          action
        }`;

      // Get user info for the comment
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', userId)
        .single();

      const userName = userProfile?.full_name || userProfile?.email || 'User';

      await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          workspace_id: workspaceId,
          user_id: userId,
          comment: `${userName}: ${systemComment}`,
          is_system: true
        });

      const actionMessages = {
        'approve': 'approved',
        'reject': 'rejected',
        'changes_requested': 'marked for changes',
        'mark_resolved': 'marked as resolved and sent for re-approval'
      };

      // Send notification to post creator (non-blocking)
      sendApprovalNotification(supabase, {
        postId,
        workspaceId,
        action,
        reviewerId: userId,
        comment
      });

      // Send comment notification to approvers/collaborators (for change requests and rejections)
      // This ensures admins/editors are notified when clients request changes
      if (action === 'changes_requested' || action === 'reject') {
        sendNewCommentNotification(supabase, {
          postId,
          workspaceId,
          commenterId: userId,
          commenterName: userName,
          comment: systemComment
        });
      }

      // Invalidate cache after approval action
      await invalidateWorkspaceCache(workspaceId);

      return sendSuccess(res, {
        status: newStatus,
        message: `Post ${actionMessages[action]}`
      });

    } catch (error) {
      logError('post.approve.post.handler', error);
      return sendError(res, "Failed to update approval status", ErrorCodes.INTERNAL_ERROR);
    }
  }

  // GET - Get approval status and comments for a post
  else if (req.method === "GET") {
    try {
      const { postId } = req.query;

      if (!postId) {
        return sendError(res, "postId is required", ErrorCodes.VALIDATION_ERROR);
      }

      if (!isValidUUID(postId)) {
        return sendError(res, "Invalid postId format", ErrorCodes.VALIDATION_ERROR);
      }

      // Get approval record
      const { data: approval, error: approvalError } = await supabase
        .from('post_approvals')
        .select(`
          id,
          approval_status,
          reviewed_at,
          reviewed_by,
          user_profiles!reviewed_by (
            full_name,
            email
          )
        `)
        .eq('post_id', postId)
        .single();

      if (approvalError && approvalError.code !== 'PGRST116') {
        logError('post.approve.getApproval', approvalError, { postId });
      }

      // Get comments
      const { data: comments, error: commentsError } = await supabase
        .from('post_comments')
        .select(`
          id,
          comment,
          is_system,
          created_at,
          user_id,
          user_profiles (
            full_name,
            email,
            avatar_url
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (commentsError) {
        logError('post.approve.getComments', commentsError, { postId });
      }

      return sendSuccess(res, {
        approval: approval || { approval_status: 'pending' },
        comments: comments || []
      });

    } catch (error) {
      logError('post.approve.get.handler', error);
      return sendError(res, "Failed to fetch approval status", ErrorCodes.INTERNAL_ERROR);
    }
  }

  else {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }
};
