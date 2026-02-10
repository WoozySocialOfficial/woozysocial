const { createNotification } = require("../_notificationHelper");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();

  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { workspaceId, postId, postCaption, scheduledAt, platforms } = req.body;

    if (!workspaceId) {
      return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (postId && !isValidUUID(postId)) {
      return sendError(res, "Invalid postId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get workspace details
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single();

    if (workspaceError && workspaceError.code !== 'PGRST116') {
      logError('notifications.send-approval.getWorkspace', workspaceError, { workspaceId });
    }

    // Get all view_only (client) members of the workspace
    const { data: clients, error: clientsError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('role', 'view_only');

    if (clientsError) {
      logError('notifications.send-approval.getClients', clientsError, { workspaceId });
      return sendError(res, "Failed to fetch client members", ErrorCodes.DATABASE_ERROR);
    }

    if (!clients || clients.length === 0) {
      // No clients to notify
      return sendSuccess(res, { notified: 0, emailsSent: 0, message: "No clients to notify" });
    }

    const appUrl = process.env.APP_URL || 'https://woozysocials.com';
    const workspaceName = workspace?.name || 'your workspace';
    const platformList = platforms?.join(', ') || 'multiple platforms';
    const scheduledDate = scheduledAt ? new Date(scheduledAt).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : 'To be scheduled';

    // Send notification to each client using the notification helper
    // This will create in-app notification + send email only if user has email notifications enabled
    let notified = 0;
    let emailsSent = 0;

    for (const client of clients) {
      const result = await createNotification({
        userId: client.user_id,
        workspaceId: workspaceId,
        postId: postId,
        type: 'approval_request',
        title: 'New Post Awaiting Your Approval',
        message: `A new post for ${platformList} needs your approval`,
        actionUrl: '/client/approvals',
        emailData: {
          subject: `New Post Awaiting Your Approval - ${workspaceName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
              <div style="background: #ffffff; border-radius: 12px; padding: 30px; border: 1px solid #e5e7eb;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <img src="https://woozysocials.com/ChatGPT%20Image%20Dec%2031,%202025,%2004_19_09%20PM.png" alt="Woozy Social" style="height: 40px;" />
                </div>

                <h2 style="color: #114C5A; margin: 0 0 16px 0;">New Post Needs Your Approval</h2>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  A new social media post has been scheduled for <strong>${workspaceName}</strong> and needs your approval before it goes live.
                </p>

                <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
                  <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Post Preview
                  </p>
                  <p style="margin: 0; color: #111827; font-size: 15px; line-height: 1.6;">
                    ${postCaption ? postCaption.substring(0, 200) + (postCaption.length > 200 ? '...' : '') : 'No caption provided'}
                  </p>
                  <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-size: 13px;">
                      <strong>Scheduled:</strong> ${scheduledDate}
                    </span>
                    <br />
                    <span style="color: #6b7280; font-size: 13px;">
                      <strong>Platforms:</strong> ${platformList}
                    </span>
                  </div>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${appUrl}/client/approvals" style="background-color: #FFC801; color: #114C5A; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
                    Review & Approve
                  </a>
                </div>

                <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 24px 0 0 0;">
                  You're receiving this email because you enabled email notifications in your profile settings.
                  <a href="${appUrl}/profile-settings" style="color: #6465f1; text-decoration: none;">Manage preferences</a>
                </p>
              </div>
            </div>
          `
        }
      });

      if (result.success) {
        notified++;
        if (result.emailSent) {
          emailsSent++;
        }
      }
    }

    return sendSuccess(res, {
      notified,
      emailsSent,
      message: `Notified ${notified} client(s), sent ${emailsSent} email(s)`
    });

  } catch (error) {
    logError('notifications.send-approval.handler', error);
    return sendError(res, "Failed to send notifications", ErrorCodes.INTERNAL_ERROR);
  }
};
