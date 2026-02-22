const axios = require("axios");
const { sendApprovalNotification, sendNewCommentNotification, sendApprovalRequestNotification, sendInternalRejectionNotification } = require("../notifications/helpers");
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

const VALID_ACTIONS = ['approve', 'reject', 'changes_requested', 'mark_resolved', 'forward_to_client'];

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
      if (action === 'mark_resolved') {
        // Editors, admins, and clients can mark changes as resolved
        // Use canCreatePosts since editors have this permission
        const canCreate = checkPermission(member, 'canCreatePosts');
        if (!canCreate.success) {
          return sendError(res, "You don't have permission to mark changes as resolved", ErrorCodes.FORBIDDEN);
        }
      } else if (action === 'forward_to_client') {
        // Only final approvers can forward to client
        const hasFinalApproval = member.can_final_approval === true || member.role === 'owner';
        if (!hasFinalApproval) {
          return sendError(res, "Only final approvers can forward posts to clients", ErrorCodes.FORBIDDEN);
        }
      } else if (action === 'approve' || action === 'reject' || action === 'changes_requested') {
        // Permission check depends on current post status
        const { data: post } = await supabase
          .from('posts')
          .select('approval_status, workspace_id')
          .eq('id', postId)
          .single();

        if (!post) {
          return sendError(res, "Post not found", ErrorCodes.NOT_FOUND);
        }

        let hasPermission = false;

        if (post.approval_status === 'pending_internal') {
          // Final approvers can approve/reject at this stage
          hasPermission = member.can_final_approval === true || member.role === 'owner';
        } else if (post.approval_status === 'pending_client' || post.approval_status === 'pending') {
          // Clients (viewers with can_approve_posts) can approve at this stage
          hasPermission = (
            (member.role === 'viewer' && member.can_approve_posts === true) ||
            member.role === 'owner'
          );
        } else if (post.approval_status === 'changes_requested') {
          // Both final approvers and clients can act on changes_requested
          hasPermission = (
            member.can_final_approval === true ||
            (member.role === 'viewer' && member.can_approve_posts === true) ||
            member.role === 'owner'
          );
        }

        if (!hasPermission) {
          return sendError(res, "You don't have permission to perform this action", ErrorCodes.FORBIDDEN);
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

      // If the current user has can_approve_posts toggle, they can approve
      const userCanApprove = member.can_approve_posts === true || member.role === 'owner';

      // Also check if workspace has viewers (who may need approval workflows)
      const { data: viewers } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('role', 'viewer')
        .limit(1);

      const hasViewers = viewers && viewers.length > 0;

      // Allow approval if:
      // 1. User has can_approve_posts toggle (or is owner)
      // 2. OR tier has the approvalWorkflows feature
      // 3. OR workspace has viewers (viewers viewing means approval was required)
      if (!userCanApprove && !hasFeature(tier, 'approvalWorkflows') && !hasViewers) {
        return sendError(
          res,
          "Approval workflows are not available on your subscription tier. Please upgrade to Pro Plus or Agency to access this feature.",
          ErrorCodes.FORBIDDEN
        );
      }

      // Map action to status
      let newStatus;

      if (action === 'approve') {
        newStatus = 'approved';
      } else if (action === 'reject') {
        newStatus = 'rejected';
      } else if (action === 'changes_requested') {
        newStatus = 'changes_requested';
      } else if (action === 'forward_to_client') {
        newStatus = 'pending_client';
      } else if (action === 'mark_resolved') {
        // Check if post was in internal review or client review
        const { data: post } = await supabase
          .from('posts')
          .select('approval_status, workspace_id')
          .eq('id', postId)
          .single();

        // Check if workspace has final approvers
        const { data: finalApprovers } = await supabase
          .from('workspace_members')
          .select('id')
          .eq('workspace_id', post.workspace_id)
          .eq('can_final_approval', true)
          .limit(1);

        const hasFinalApprovers = finalApprovers && finalApprovers.length > 0;

        // If final approvers exist, go back to internal review; otherwise, go to client
        newStatus = hasFinalApprovers ? 'pending_internal' : 'pending';
      }

      // Guard: prevent re-approving a post that's already approved/scheduled/posted
      // Allow re-approval if status is 'failed' (retry after Ayrshare failure)
      if (action === 'approve') {
        const { data: currentPost } = await supabase
          .from('posts')
          .select('status, approval_status')
          .eq('id', postId)
          .single();

        if (currentPost && currentPost.status !== 'failed' && (currentPost.approval_status === 'approved' || currentPost.status === 'scheduled' || currentPost.status === 'posted')) {
          return res.status(200).json({
            success: true,
            message: 'Post already approved',
            alreadyProcessed: true
          });
        }
      }

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

      // Send appropriate notifications based on action
      if (action === 'forward_to_client' && workspaceId) {
        // Get post details for notification
        const { data: post } = await supabase
          .from('posts')
          .select('platforms, created_by')
          .eq('id', postId)
          .single();

        // Notify clients (viewers with can_approve_posts)
        await sendApprovalRequestNotification(supabase, {
          workspaceId,
          postId,
          platforms: post?.platforms || [],
          createdByUserId: userId
        }).catch(err =>
          logError('post.approve.notification.forwardToClient', err, { postId })
        );
      } else if (action === 'changes_requested' && workspaceId) {
        // Get post details for notification
        const { data: post } = await supabase
          .from('posts')
          .select('approval_status, created_by')
          .eq('id', postId)
          .single();

        // If changes requested from internal review, notify creator
        if (post && post.approval_status === 'changes_requested') {
          await sendInternalRejectionNotification(supabase, {
            workspaceId,
            postId,
            createdByUserId: post.created_by,
            comment: comment || 'Changes requested'
          }).catch(err =>
            logError('post.approve.notification.internalRejection', err, { postId })
          );
        }
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

        if (post && (post.status === 'pending_approval' || post.status === 'failed')) {
          // Get workspace profile key — no env var fallback to avoid using the wrong profile
          const profileKey = await getWorkspaceProfileKey(workspaceId);

          if (!profileKey) {
            // Roll back approval_status so the post isn't stuck
            await supabase
              .from('posts')
              .update({ approval_status: 'pending_client', status: 'pending_approval' })
              .eq('id', postId);
            await supabase.from('post_approvals').update({ approval_status: 'pending_client' }).eq('post_id', postId);
            return sendError(
              res,
              "This workspace has no social media profile configured. Please connect your social accounts first.",
              ErrorCodes.VALIDATION_ERROR
            );
          }

          try {
            const ayrshareResponse = await sendToAyrshare(post, profileKey);

            console.log('[approve] Ayrshare response:', JSON.stringify(ayrshareResponse, null, 2));

            if (ayrshareResponse.status !== 'error') {
              // Update post with Ayrshare ID and new status
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
              // Ayrshare returned error — roll back approval_status so the post can be retried
              const errorMsg = ayrshareResponse.message || 'Failed to post to Ayrshare';
              await supabase
                .from('posts')
                .update({
                  status: 'failed',
                  approval_status: 'pending_client',
                  last_error: errorMsg
                })
                .eq('id', postId);
              await supabase.from('post_approvals').update({ approval_status: 'pending_client' }).eq('post_id', postId);

              return sendError(
                res,
                `Failed to post to social platforms: ${errorMsg}`,
                ErrorCodes.EXTERNAL_API_ERROR,
                ayrshareResponse
              );
            }
          } catch (ayrError) {
            logError('post.approve.ayrshare', ayrError, { postId, workspaceId });
            const errorMsg = ayrError.response?.data?.message || ayrError.message;

            // Roll back approval_status so the post can be retried
            await supabase
              .from('posts')
              .update({
                status: 'failed',
                approval_status: 'pending_client',
                last_error: errorMsg
              })
              .eq('id', postId);
            await supabase.from('post_approvals').update({ approval_status: 'pending_client' }).eq('post_id', postId);

            return sendError(
              res,
              `Failed to send post to social platforms: ${errorMsg}`,
              ErrorCodes.EXTERNAL_API_ERROR,
              ayrError.response?.data
            );
          }
        }
      }

      // Add system comment if provided or create default one
      const systemComment = comment ||
        (action === 'forward_to_client' ? 'Forwarded Post' :
        `Post ${
          action === 'approve' ? 'approved' :
          action === 'reject' ? 'rejected' :
          action === 'changes_requested' ? 'marked for changes' :
          action === 'mark_resolved' ? 'changes resolved - ready for re-approval' :
          action
        }`);

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
        'forward_to_client': 'forwarded to client',
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
