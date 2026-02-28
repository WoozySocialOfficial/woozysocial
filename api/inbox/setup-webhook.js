const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  parseBody,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  isServiceConfigured
} = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * Setup Ayrshare Webhook for Messages
 *
 * POST /api/inbox/setup-webhook
 * Body: { workspaceId, webhookUrl? }
 *
 * Registers webhook with Ayrshare to receive real-time message notifications
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  if (!isServiceConfigured('ayrshare')) {
    return sendError(res, "Social media service is not configured", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const body = await parseBody(req);
    const { workspaceId, webhookUrl } = body;

    if (!workspaceId) {
      return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No social accounts connected for this workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Determine the webhook URL
    const baseUrl = webhookUrl || process.env.APP_URL || req.headers.origin;
    if (!baseUrl) {
      return sendError(res, "Unable to determine webhook URL. Please provide webhookUrl or configure APP_URL.", ErrorCodes.VALIDATION_ERROR);
    }

    const fullWebhookUrl = `${baseUrl}/api/inbox/webhook`;

    // Register webhook with Ayrshare
    let response;
    try {
      response = await axios.post(
        `${BASE_AYRSHARE}/hook/webhook`,
        {
          action: "messages",
          url: fullWebhookUrl
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey
          },
          timeout: 30000
        }
      );
    } catch (axiosError) {
      logError('inbox.setup-webhook.ayrshare', axiosError, { workspaceId });
      return sendError(
        res,
        "Failed to setup webhook",
        ErrorCodes.EXTERNAL_API_ERROR,
        axiosError.response?.data
      );
    }

    return sendSuccess(res, {
      webhookUrl: fullWebhookUrl,
      ayrshareResponse: response.data
    });

  } catch (error) {
    logError('inbox.setup-webhook.handler', error);
    return sendError(res, "Failed to setup webhook", ErrorCodes.INTERNAL_ERROR);
  }
};
