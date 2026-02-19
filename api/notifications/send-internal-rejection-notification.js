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
    const { workspaceId, postId, createdByUserId, comment } = req.body;

    if (!createdByUserId || !isValidUUID(createdByUserId)) {
      return sendError(res, "Valid createdByUserId is required", ErrorCodes.VALIDATION_ERROR);
    }

    // Get workspace details
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single();

    // Get post details
    const { data: post } = await supabase
      .from('posts')
      .select('caption, platforms')
      .eq('id', postId)
      .single();

    const appUrl = process.env.APP_URL || 'https://woozysocials.com';
    const workspaceName = workspace?.name || 'your workspace';
    const platformList = post?.platforms?.join(', ') || 'multiple platforms';

    // Send notification to creator
    const result = await createNotification({
      userId: createdByUserId,
      workspaceId: workspaceId,
      postId: postId,
      type: 'internal_changes_requested',
      title: 'Changes Requested on Your Post',
      message: `A final approver has requested changes on your post for ${platformList}`,
      actionUrl: `/approvals?postId=${postId}`,
      emailData: {
        subject: `Changes Requested - ${workspaceName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
            <div style="background: #ffffff; border-radius: 12px; padding: 30px; border: 1px solid #e5e7eb;">
              <div style="text-align: center; margin-bottom: 24px;">
                <img src="https://woozysocials.com/ChatGPT%20Image%20Dec%2031,%202025,%2004_19_09%20PM.png" alt="Woozy Social" style="height: 40px;" />
              </div>

              <h2 style="color: #114C5A; margin: 0 0 16px 0;">✏️ Changes Requested</h2>

              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                A final approver has reviewed your post for <strong>${workspaceName}</strong> and requested some changes before it can be approved or sent to the client.
              </p>

              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600;">
                  Feedback:
                </p>
                <p style="margin: 8px 0 0 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                  ${comment || 'Please review the feedback in the comments section.'}
                </p>
              </div>

              <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Post Preview
                </p>
                <p style="margin: 0; color: #111827; font-size: 15px; line-height: 1.6;">
                  ${post?.caption ? post.caption.substring(0, 200) + (post.caption.length > 200 ? '...' : '') : 'No caption'}
                </p>
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                  <span style="color: #6b7280; font-size: 13px;">
                    <strong>Platforms:</strong> ${platformList}
                  </span>
                </div>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${appUrl}/approvals?postId=${postId}" style="background-color: #FFC801; color: #114C5A; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
                  View Post & Make Changes
                </a>
              </div>

              <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 24px 0 0 0;">
                After making changes, mark the post as resolved to resubmit for review.
              </p>
            </div>
          </div>
        `
      }
    });

    return sendSuccess(res, {
      notified: result.success ? 1 : 0,
      emailSent: result.emailSent ? 1 : 0,
      message: result.success ? "Creator notified" : "Failed to notify creator"
    });

  } catch (error) {
    logError('notifications.send-internal-rejection.handler', error);
    return sendError(res, "Failed to send notification", ErrorCodes.INTERNAL_ERROR);
  }
};
