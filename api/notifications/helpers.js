/**
 * Notification Helper Functions
 *
 * These helper functions can be imported and used across different API endpoints
 * to trigger notifications for various events.
 */

const { logError } = require("../_utils");

/**
 * Send notification when a post approval decision is made
 */
async function sendApprovalNotification(supabase, { postId, workspaceId, action, reviewerId, comment }) {
  try {
    const { data: postData } = await supabase
      .from('posts')
      .select('created_by, caption')
      .eq('id', postId)
      .single();

    if (!postData?.created_by || postData.created_by === reviewerId) return;

    const notificationConfig = {
      'approve': {
        type: 'post_approved',
        title: 'Post Approved',
        message: 'Your post has been approved and will be published as scheduled.'
      },
      'reject': {
        type: 'post_rejected',
        title: 'Post Rejected',
        message: 'Your post has been rejected. Please review the feedback.'
      },
      'changes_requested': {
        type: 'changes_requested',
        title: 'Changes Requested',
        message: 'Changes have been requested on your post. Please review and update.'
      }
    };

    const config = notificationConfig[action];
    if (!config) return;

    await supabase.from('notifications').insert({
      user_id: postData.created_by,
      workspace_id: workspaceId,
      post_id: postId,
      type: config.type,
      title: config.title,
      message: config.message,
      actor_id: reviewerId,
      metadata: { comment: comment || null },
      read: false
    });
  } catch (error) {
    logError('notifications.helpers.approval', error, { postId, action });
  }
}

/**
 * Send notification when a workspace invite is created
 */
async function sendWorkspaceInviteNotification(supabase, { email, workspaceId, workspaceName, inviterId, inviteToken, role }) {
  try {
    // Check if the user exists
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (!userProfile) return; // User doesn't have an account yet

    await supabase.from('notifications').insert({
      user_id: userProfile.id,
      workspace_id: workspaceId,
      type: 'workspace_invite',
      title: 'Workspace Invitation',
      message: `You've been invited to join ${workspaceName} as ${role === 'view_only' ? 'a viewer' : `an ${role}`}.`,
      actor_id: inviterId,
      metadata: { inviteToken, role },
      read: false
    });
  } catch (error) {
    logError('notifications.helpers.invite', error, { email, workspaceId });
  }
}

/**
 * Send notification when an invite is accepted
 */
async function sendInviteAcceptedNotification(supabase, { workspaceId, inviterId, acceptedByUserId, acceptedByName }) {
  try {
    await supabase.from('notifications').insert({
      user_id: inviterId,
      workspace_id: workspaceId,
      type: 'invite_accepted',
      title: 'Invitation Accepted',
      message: `${acceptedByName} has accepted your invitation and joined the workspace.`,
      actor_id: acceptedByUserId,
      metadata: {},
      read: false
    });
  } catch (error) {
    logError('notifications.helpers.inviteAccepted', error, { workspaceId, inviterId });
  }
}

/**
 * Send notification when a member's role is changed
 */
async function sendRoleChangedNotification(supabase, { userId, workspaceId, workspaceName, oldRole, newRole, changedByUserId }) {
  try {
    const roleLabels = {
      'owner': 'Owner',
      'admin': 'Admin',
      'editor': 'Editor',
      'view_only': 'Viewer',
      'client': 'Client'
    };

    await supabase.from('notifications').insert({
      user_id: userId,
      workspace_id: workspaceId,
      type: 'role_changed',
      title: 'Role Updated',
      message: `Your role in ${workspaceName} has been changed to ${roleLabels[newRole] || newRole}.`,
      actor_id: changedByUserId,
      metadata: { oldRole, newRole },
      read: false
    });
  } catch (error) {
    logError('notifications.helpers.roleChanged', error, { userId, workspaceId });
  }
}

/**
 * Send notification when a new member joins
 */
async function sendMemberJoinedNotification(supabase, { workspaceId, newMemberName, newMemberId, notifyUserIds }) {
  try {
    const notifications = notifyUserIds
      .filter(id => id !== newMemberId)
      .map(userId => ({
        user_id: userId,
        workspace_id: workspaceId,
        type: 'member_joined',
        title: 'New Team Member',
        message: `${newMemberName} has joined the workspace.`,
        actor_id: newMemberId,
        metadata: {},
        read: false
      }));

    if (notifications.length > 0) {
      await supabase.from('notifications').insert(notifications);
    }
  } catch (error) {
    logError('notifications.helpers.memberJoined', error, { workspaceId, newMemberId });
  }
}

/**
 * Send notification when a new comment is added to a post
 * Works for both published posts and to-be-posted (pending approval) posts
 */
async function sendNewCommentNotification(supabase, { postId, workspaceId, commenterId, commenterName, comment }) {
  try {
    // Get the post details including status
    const { data: post } = await supabase
      .from('posts')
      .select('created_by, status, approval_status')
      .eq('id', postId)
      .single();

    const { data: comments } = await supabase
      .from('post_comments')
      .select('user_id')
      .eq('post_id', postId)
      .neq('user_id', commenterId);

    // Get unique users to notify (post creator + previous commenters)
    const usersToNotify = new Set();
    if (post?.created_by && post.created_by !== commenterId) {
      usersToNotify.add(post.created_by);
    }
    comments?.forEach(c => {
      if (c.user_id !== commenterId) {
        usersToNotify.add(c.user_id);
      }
    });

    // For to-be-posted posts (pending approval), also notify approvers
    if (post?.status === 'pending_approval' || post?.approval_status === 'pending') {
      const { data: approvers } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspaceId)
        .in('role', ['client', 'view_only', 'owner', 'admin'])
        .neq('user_id', commenterId);

      approvers?.forEach(approver => {
        if (approver.user_id !== commenterId) {
          usersToNotify.add(approver.user_id);
        }
      });
    }

    if (usersToNotify.size === 0) return;

    // Customize message based on post status
    const isToBePosted = post?.status === 'pending_approval' || post?.approval_status === 'pending';
    const postContext = isToBePosted ? 'a post awaiting approval' : 'a post';

    const notifications = Array.from(usersToNotify).map(userId => ({
      user_id: userId,
      workspace_id: workspaceId,
      post_id: postId,
      type: 'new_comment',
      title: 'New Comment',
      message: `${commenterName} commented on ${postContext}: "${comment.substring(0, 50)}${comment.length > 50 ? '...' : ''}"`,
      actor_id: commenterId,
      metadata: { isToBePosted },
      read: false
    }));

    await supabase.from('notifications').insert(notifications);
  } catch (error) {
    logError('notifications.helpers.newComment', error, { postId, commenterId });
  }
}

/**
 * Send notification when a post is scheduled
 */
async function sendPostScheduledNotification(supabase, { postId, workspaceId, scheduledAt, platforms, createdByUserId }) {
  try {
    console.log('[sendPostScheduledNotification] Starting...', { workspaceId, postId, createdByUserId });
    console.log('[sendPostScheduledNotification] About to query workspace_members...');

    // Notify workspace admins/owners (excluding the creator)
    const { data: admins, error: queryError } = await supabase
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspaceId)
      .in('role', ['owner', 'admin'])
      .neq('user_id', createdByUserId);

    console.log('[sendPostScheduledNotification] Query completed. Error:', queryError, 'Data:', admins);

    if (queryError) {
      console.log('[sendPostScheduledNotification] Query error detected, returning early');
      logError('notifications.helpers.postScheduled.query', queryError, { workspaceId, postId });
      return;
    }

    console.log('[sendPostScheduledNotification] Admins found (excluding creator):', admins?.length || 0, 'roles:', admins?.map(a => a.role));

    if (!admins || admins.length === 0) {
      console.log('[sendPostScheduledNotification] No admins found (or all are creator), skipping notification');
      return;
    }

    const scheduledDate = new Date(scheduledAt).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const notifications = admins.map(admin => ({
      user_id: admin.user_id,
      workspace_id: workspaceId,
      post_id: postId,
      type: 'post_scheduled',
      title: 'New Post Scheduled',
      message: `A new post has been scheduled for ${scheduledDate} on ${platforms.join(', ')}.`,
      actor_id: createdByUserId,
      metadata: { scheduledAt, platforms },
      read: false
    }));

    const { data: insertedData, error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      logError('notifications.helpers.postScheduled.insert', insertError, { workspaceId, postId, count: notifications.length });
    } else {
      console.log('[sendPostScheduledNotification] Successfully created', notifications.length, 'notifications');
    }
  } catch (error) {
    logError('notifications.helpers.postScheduled', error, { postId, workspaceId });
  }
}

/**
 * Send notification for new inbox message
 */
async function sendInboxMessageNotification(supabase, { workspaceId, platform, senderName, messagePreview }) {
  try {
    // Notify all workspace members
    const { data: members } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);

    if (!members || members.length === 0) return;

    const notifications = members.map(member => ({
      user_id: member.user_id,
      workspace_id: workspaceId,
      type: 'inbox_message',
      title: `New ${platform} Message`,
      message: `${senderName}: ${messagePreview.substring(0, 50)}${messagePreview.length > 50 ? '...' : ''}`,
      metadata: { platform, senderName },
      read: false
    }));

    await supabase.from('notifications').insert(notifications);
  } catch (error) {
    logError('notifications.helpers.inboxMessage', error, { workspaceId, platform });
  }
}

/**
 * Send notification when a workspace invitation is cancelled
 */
async function sendInviteCancelledNotification(supabase, { email, workspaceId, workspaceName, cancelledByUserId }) {
  try {
    // Check if the user exists
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (!userProfile) return; // User doesn't have an account yet

    await supabase.from('notifications').insert({
      user_id: userProfile.id,
      workspace_id: workspaceId,
      type: 'invite_cancelled',
      title: 'Invitation Cancelled',
      message: `Your invitation to join ${workspaceName} has been cancelled.`,
      actor_id: cancelledByUserId,
      metadata: {},
      read: false
    });
  } catch (error) {
    logError('notifications.helpers.inviteCancelled', error, { email, workspaceId });
  }
}

/**
 * Send notification when a member is removed from workspace
 */
async function sendMemberRemovedNotification(supabase, { removedUserId, workspaceId, workspaceName, removedByUserId, removedByName }) {
  try {
    await supabase.from('notifications').insert({
      user_id: removedUserId,
      workspace_id: workspaceId,
      type: 'member_removed',
      title: 'Removed from Workspace',
      message: `You have been removed from ${workspaceName} by ${removedByName}.`,
      actor_id: removedByUserId,
      metadata: {},
      read: false
    });
  } catch (error) {
    logError('notifications.helpers.memberRemoved', error, { removedUserId, workspaceId });
  }
}

/**
 * Send notification when a social account is linked to workspace
 */
async function sendSocialAccountLinkedNotification(supabase, { workspaceId, platform, linkedByUserId, linkedByName }) {
  try {
    // Notify workspace admins/owners (except the person who linked it)
    const { data: admins } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .in('role', ['owner', 'admin'])
      .neq('user_id', linkedByUserId);

    if (!admins || admins.length === 0) return;

    const platformLabels = {
      'facebook': 'Facebook',
      'instagram': 'Instagram',
      'twitter': 'Twitter',
      'linkedin': 'LinkedIn',
      'tiktok': 'TikTok',
      'youtube': 'YouTube'
    };

    const notifications = admins.map(admin => ({
      user_id: admin.user_id,
      workspace_id: workspaceId,
      type: 'social_account_linked',
      title: 'Social Account Linked',
      message: `${linkedByName} connected ${platformLabels[platform] || platform} to the workspace.`,
      actor_id: linkedByUserId,
      metadata: { platform },
      read: false
    }));

    await supabase.from('notifications').insert(notifications);
  } catch (error) {
    logError('notifications.helpers.socialAccountLinked', error, { workspaceId, platform });
  }
}

/**
 * Send notification when a social account is unlinked from workspace
 */
async function sendSocialAccountUnlinkedNotification(supabase, { workspaceId, platform, unlinkedByUserId, unlinkedByName }) {
  try {
    // Notify workspace admins/owners (except the person who unlinked it)
    const { data: admins } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .in('role', ['owner', 'admin'])
      .neq('user_id', unlinkedByUserId);

    if (!admins || admins.length === 0) return;

    const platformLabels = {
      'facebook': 'Facebook',
      'instagram': 'Instagram',
      'twitter': 'Twitter',
      'linkedin': 'LinkedIn',
      'tiktok': 'TikTok',
      'youtube': 'YouTube'
    };

    const notifications = admins.map(admin => ({
      user_id: admin.user_id,
      workspace_id: workspaceId,
      type: 'social_account_unlinked',
      title: 'Social Account Disconnected',
      message: `${unlinkedByName} disconnected ${platformLabels[platform] || platform} from the workspace.`,
      actor_id: unlinkedByUserId,
      metadata: { platform },
      read: false
    }));

    await supabase.from('notifications').insert(notifications);
  } catch (error) {
    logError('notifications.helpers.socialAccountUnlinked', error, { workspaceId, platform });
  }
}

/**
 * Send notification when a post fails to publish
 */
async function sendPostFailedNotification(supabase, { postId, workspaceId, createdByUserId, platforms, errorMessage }) {
  try {
    // Get workspace admins/owners to notify
    const { data: admins } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .in('role', ['owner', 'admin', 'editor']);

    if (!admins || admins.length === 0) return;

    // Always notify the post creator
    const usersToNotify = new Set([createdByUserId]);
    admins.forEach(admin => usersToNotify.add(admin.user_id));

    const notifications = Array.from(usersToNotify).map(userId => ({
      user_id: userId,
      workspace_id: workspaceId,
      post_id: postId,
      type: 'post_failed',
      title: 'Post Failed to Publish',
      message: `A post scheduled for ${platforms.join(', ')} failed to publish. ${errorMessage ? 'Error: ' + errorMessage.substring(0, 100) : 'Please check the post details.'}`,
      actor_id: createdByUserId,
      metadata: { platforms, errorMessage },
      read: false
    }));

    await supabase.from('notifications').insert(notifications);
  } catch (error) {
    logError('notifications.helpers.postFailed', error, { postId, workspaceId });
  }
}

/**
 * Send notification when a post is published immediately (Post Now)
 */
async function sendPostPublishedNotification(supabase, { postId, workspaceId, createdByUserId, platforms }) {
  try {
    // Notify workspace admins/owners (except the person who posted)
    const { data: admins } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .in('role', ['owner', 'admin'])
      .neq('user_id', createdByUserId);

    if (!admins || admins.length === 0) return;

    const notifications = admins.map(admin => ({
      user_id: admin.user_id,
      workspace_id: workspaceId,
      post_id: postId,
      type: 'post_published',
      title: 'Post Published',
      message: `A new post has been published to ${platforms.join(', ')}.`,
      actor_id: createdByUserId,
      metadata: { platforms },
      read: false
    }));

    await supabase.from('notifications').insert(notifications);
  } catch (error) {
    logError('notifications.helpers.postPublished', error, { postId, workspaceId });
  }
}

/**
 * Send approval request notification to clients
 */
async function sendApprovalRequestNotification(supabase, { workspaceId, postId, platforms, createdByUserId }) {
  try {
    console.log('[sendApprovalRequestNotification] Starting...', { workspaceId, postId, platforms });
    console.log('[sendApprovalRequestNotification] About to query workspace_members...');

    // Get all view_only and client members (database may use either role name)
    const { data: clients, error: queryError } = await supabase
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspaceId)
      .in('role', ['view_only', 'client']);

    console.log('[sendApprovalRequestNotification] Query completed. Error:', queryError, 'Data:', clients);

    if (queryError) {
      console.log('[sendApprovalRequestNotification] Query error detected, returning early');
      logError('notifications.helpers.approvalRequest.query', queryError, { workspaceId, postId });
      return;
    }

    console.log('[sendApprovalRequestNotification] Clients found:', clients?.length || 0, 'roles:', clients?.map(c => c.role));

    if (!clients || clients.length === 0) {
      console.log('[sendApprovalRequestNotification] No clients found, skipping notification');
      return;
    }

    const platformList = platforms?.join(', ') || 'multiple platforms';

    const notifications = clients.map(client => ({
      user_id: client.user_id,
      workspace_id: workspaceId,
      post_id: postId,
      type: 'approval_request',
      title: 'New Post Awaiting Approval',
      message: `A new post for ${platformList} needs your approval`,
      actor_id: createdByUserId,
      read: false,
      metadata: { platforms }
    }));

    const { data: insertedData, error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      logError('notifications.helpers.approvalRequest.insert', insertError, { workspaceId, postId, count: notifications.length });
    } else {
      console.log('[sendApprovalRequestNotification] Successfully created', notifications.length, 'notifications');
    }
  } catch (error) {
    logError('notifications.helpers.approvalRequest', error, { workspaceId, postId });
  }
}

module.exports = {
  sendApprovalNotification,
  sendWorkspaceInviteNotification,
  sendInviteAcceptedNotification,
  sendRoleChangedNotification,
  sendMemberJoinedNotification,
  sendNewCommentNotification,
  sendPostScheduledNotification,
  sendInboxMessageNotification,
  sendInviteCancelledNotification,
  sendMemberRemovedNotification,
  sendSocialAccountLinkedNotification,
  sendSocialAccountUnlinkedNotification,
  sendPostFailedNotification,
  sendPostPublishedNotification,
  sendApprovalRequestNotification
};
