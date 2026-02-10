const { getSupabaseServiceRole } = require('./_utils');
const { Resend } = require('resend');

/**
 * Create a notification and optionally send email based on user preferences
 *
 * This function ALWAYS creates an in-app notification, but only sends email
 * if the user has email_notifications enabled in their profile settings.
 *
 * @param {Object} params - Notification parameters
 * @param {string} params.userId - User ID to notify (required)
 * @param {string} params.workspaceId - Workspace ID (optional)
 * @param {string} params.postId - Post ID (optional)
 * @param {string} params.type - Notification type (required)
 * @param {string} params.title - Notification title (required)
 * @param {string} params.message - Notification message (required)
 * @param {string} params.actionUrl - URL for action button (optional)
 * @param {Object} params.metadata - Additional metadata (optional)
 * @param {Object} params.emailData - Email data if email should be sent (optional)
 * @param {string} params.emailData.from - Email sender (defaults to Woozy Social)
 * @param {string} params.emailData.subject - Email subject (defaults to title)
 * @param {string} params.emailData.html - Email HTML body (required if emailData provided)
 *
 * @returns {Promise<Object>} Result object with success status, notification, and emailSent flag
 *
 * @example
 * const result = await createNotification({
 *   userId: '123',
 *   workspaceId: '456',
 *   type: 'approval_request',
 *   title: 'New Post Awaiting Approval',
 *   message: 'A new post needs your review',
 *   actionUrl: '/client/approvals',
 *   emailData: {
 *     subject: 'New Post Awaiting Approval',
 *     html: '<p>...</p>'
 *   }
 * });
 */
async function createNotification({
  userId,
  workspaceId = null,
  postId = null,
  type,
  title,
  message,
  actionUrl = null,
  metadata = null,
  emailData = null
}) {
  const supabase = getSupabaseServiceRole();

  if (!supabase) {
    console.error('[Notification] Service role Supabase client not available');
    return { success: false, error: 'Service not available' };
  }

  try {
    // 1. Always create in-app notification
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        post_id: postId,
        type: type,
        title: title,
        message: message,
        action_url: actionUrl,
        metadata: metadata,
        read: false
      })
      .select()
      .single();

    if (notifError) {
      console.error('[Notification] Failed to create notification:', notifError);
      return { success: false, error: notifError };
    }

    console.log(`[Notification] Created in-app notification for user ${userId}: ${title}`);

    // 2. Get user profile and notification preferences
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.warn('[Notification] Could not fetch user profile:', profileError);
      return { success: true, notification, emailSent: false };
    }

    // Get notification preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (prefsError) {
      console.warn('[Notification] Could not fetch notification preferences:', prefsError);
      // Default to not sending email if preferences not found
      return { success: true, notification, emailSent: false };
    }

    // 3. Check if user wants email for this specific notification type
    let emailSent = false;
    let shouldSendEmail = false;

    // Map notification types to preference columns
    const emailPreferenceMap = {
      'approval_request': prefs.email_approval_requests,
      'approval_approved': prefs.email_post_approved,
      'approval_rejected': prefs.email_post_rejected,
      'post_approved': prefs.email_post_approved,
      'post_rejected': prefs.email_post_rejected,
      'team_invite': prefs.email_workspace_invites,
      'workspace_invite': prefs.email_workspace_invites,
      'new_comment': prefs.email_new_comments,
      'comment_mention': prefs.email_new_comments,
      'post_comment': prefs.email_new_comments,
      'inbox_message': prefs.email_inbox_messages,
      'inbox_mention': prefs.email_inbox_messages
    };

    shouldSendEmail = emailPreferenceMap[type] !== false; // Default to true if not in map

    if (shouldSendEmail && emailData) {
      // Check if Resend is configured
      if (!process.env.RESEND_API_KEY) {
        console.warn('[Notification] Resend API key not configured, skipping email');
        return { success: true, notification, emailSent: false };
      }

      const resend = new Resend(process.env.RESEND_API_KEY);

      try {
        await resend.emails.send({
          from: emailData.from || 'Woozy Social <hello@woozysocials.com>',
          to: [profile.email],
          subject: emailData.subject || title,
          html: emailData.html
        });

        emailSent = true;
        console.log(`[Notification] Sent email to ${profile.email}: ${emailData.subject || title}`);
      } catch (emailError) {
        console.error('[Notification] Failed to send email:', emailError);
        // Don't fail the whole operation if email fails - in-app notification already created
      }
    } else if (!shouldSendEmail && emailData) {
      console.log(`[Notification] User ${userId} has email notifications disabled for type '${type}', skipping email`);
    }

    return {
      success: true,
      notification,
      emailSent
    };

  } catch (error) {
    console.error('[Notification] Unexpected error:', error);
    return { success: false, error };
  }
}

/**
 * Create notifications for multiple users at once
 * Useful for notifying all team members or all clients
 *
 * @param {Array<Object>} notifications - Array of notification objects (same params as createNotification)
 * @returns {Promise<Object>} Result with counts
 */
async function createBulkNotifications(notifications) {
  const results = await Promise.allSettled(
    notifications.map(notif => createNotification(notif))
  );

  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const emailsSent = results.filter(r => r.status === 'fulfilled' && r.value.emailSent).length;
  const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

  return {
    total: notifications.length,
    successful,
    emailsSent,
    failed
  };
}

module.exports = {
  createNotification,
  createBulkNotifications
};
