const axios = require("axios");
const { setCors, getWorkspaceProfileKey, getSupabase, parseBody } = require("../_utils");

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
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = await parseBody(req);
    const { workspaceId, webhookUrl } = body;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return res.status(400).json({ error: "No Ayrshare profile found for this workspace" });
    }

    // Determine the webhook URL
    const baseUrl = webhookUrl || process.env.APP_URL || req.headers.origin;
    const fullWebhookUrl = `${baseUrl}/api/inbox/webhook`;

    // Register webhook with Ayrshare
    const response = await axios.post(
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
        }
      }
    );

    res.status(200).json({
      success: true,
      webhookUrl: fullWebhookUrl,
      ayrshareResponse: response.data
    });

  } catch (error) {
    console.error("Error setting up webhook:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to setup webhook",
      details: error.response?.data || error.message
    });
  }
};
