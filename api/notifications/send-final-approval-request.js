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

    if (!workspaceId || !isValidUUID(workspaceId)) {
      return sendError(res, "Valid workspaceId is required", ErrorCodes.VALIDATION_ERROR);
    }

    // Get workspace details
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single();

    // Get all final approvers (members with can_final_approval permission)
    const { data: finalApprovers, error: finalApproversError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('can_final_approval', true);

    if (finalApproversError) {
      logError('notifications.send-final-approval.getFinalApprovers', finalApproversError, { workspaceId });
      return sendError(res, "Failed to fetch final approvers", ErrorCodes.DATABASE_ERROR);
    }

    if (!finalApprovers || finalApprovers.length === 0) {
      return sendSuccess(res, { notified: 0, message: "No final approvers to notify" });
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

    // Send notification to each final approver
    let notified = 0;
    let emailsSent = 0;

    for (const finalApprover of finalApprovers) {
      const result = await createNotification({
        userId: finalApprover.user_id,
        workspaceId: workspaceId,
        postId: postId,
        type: 'final_approval_request',
        title: 'New Post Needs Your Review',
        message: `A new post for ${platformList} needs your quality review`,
        actionUrl: '/approvals',
        emailData: {
          subject: `New Post Needs Review - ${workspaceName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
              <div style="background: #ffffff; border-radius: 12px; padding: 30px; border: 1px solid #e5e7eb;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <img src="https://woozysocials.com/ChatGPT%20Image%20Dec%2031,%202025,%2004_19_09%20PM.png" alt="Woozy Social" style="height: 40px;" />
                </div>

                <h2 style="color: #114C5A; margin: 0 0 16px 0;">🔔 New Post Needs Your Review</h2>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  A new post has been created for <strong>${workspaceName}</strong> and needs your quality review before it goes to the client.
                </p>

                <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
                  <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                    📝 Post Preview
                  </p>
                  <p style="margin: 0; color: #111827; font-size: 15px; line-height: 1.6;">
                    ${postCaption ? postCaption.substring(0, 200) + (postCaption.length > 200 ? '...' : '') : 'No caption provided'}
                  </p>
                  <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-size: 13px;">
                      <strong>📅 Scheduled:</strong> ${scheduledDate}
                    </span>
                    <br />
                    <span style="color: #6b7280; font-size: 13px;">
                      <strong>📱 Platforms:</strong> ${platformList}
                    </span>
                  </div>
                </div>

                <p style="color: #374151; font-size: 14px; line-height: 1.6; background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px; margin: 16px 0;">
                  <strong>You can:</strong><br/>
                  ✅ Approve immediately (bypasses client review)<br/>
                  ➡️ Forward to client for their final approval<br/>
                  ✏️ Request changes from the creator
                </p>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${appUrl}/approvals" style="background-color: #FFC801; color: #114C5A; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
                    Review Post Now
                  </a>
                </div>

                <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 24px 0 0 0;">
                  You're receiving this as a final approver for ${workspaceName}.
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
      message: `Notified ${notified} final approver(s)`
    });

  } catch (error) {
    logError('notifications.send-final-approval.handler', error);
    return sendError(res, "Failed to send notifications", ErrorCodes.INTERNAL_ERROR);
  }
};
