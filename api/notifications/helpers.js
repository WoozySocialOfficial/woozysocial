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
 */
async function sendNewCommentNotification(supabase, { postId, workspaceId, commenterId, commenterName, comment }) {
  try {
    // Get the post creator and other commenters
    const { data: post } = await supabase
      .from('posts')
      .select('created_by')
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

    if (usersToNotify.size === 0) return;

    const notifications = Array.from(usersToNotify).map(userId => ({
      user_id: userId,
      workspace_id: workspaceId,
      post_id: postId,
      type: 'new_comment',
      title: 'New Comment',
      message: `${commenterName} commented on a post: "${comment.substring(0, 50)}${comment.length > 50 ? '...' : ''}"`,
      actor_id: commenterId,
      metadata: {},
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
    // Notify workspace admins/owners
    const { data: admins } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .in('role', ['owner', 'admin'])
      .neq('user_id', createdByUserId);

    if (!admins || admins.length === 0) return;

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

    await supabase.from('notifications').insert(notifications);
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

module.exports = {
  sendApprovalNotification,
  sendWorkspaceInviteNotification,
  sendInviteAcceptedNotification,
  sendRoleChangedNotification,
  sendMemberJoinedNotification,
  sendNewCommentNotification,
  sendPostScheduledNotification,
  sendInboxMessageNotification
};
