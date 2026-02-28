const {
  setCors,
  sendSuccess,
  validateEnv
} = require("./_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Run environment validation
  const envValidation = validateEnv();

  const envStatus = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    AYRSHARE_API_KEY: !!process.env.AYRSHARE_API_KEY,
    AYRSHARE_PROFILE_KEY: !!process.env.AYRSHARE_PROFILE_KEY,
    AYRSHARE_PRIVATE_KEY: !!process.env.AYRSHARE_PRIVATE_KEY,
    AYRSHARE_DOMAIN: !!process.env.AYRSHARE_DOMAIN,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY
  };

  // Warm up frequently-polled endpoints to prevent cold starts.
  // These endpoints will return 400 (missing params) but the lambda stays warm.
  // Without this, notifications and inbox go cold every ~30 min and users see
  // "Failed to fetch" errors for ~60 seconds until the function spins back up.
  const baseUrl = `https://${req.headers.host}`;
  const warmUpResults = {};
  try {
    const results = await Promise.allSettled([
      fetch(`${baseUrl}/api/notifications/list`).then(r => r.status),
      fetch(`${baseUrl}/api/inbox/conversations`).then(r => r.status),
    ]);
    warmUpResults.notifications = results[0].status === 'fulfilled' ? results[0].value : 'failed';
    warmUpResults.inbox = results[1].status === 'fulfilled' ? results[1].value : 'failed';
  } catch (e) {
    warmUpResults.error = e.message;
  }

  return sendSuccess(res, {
    status: envValidation.valid ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    env: envStatus,
    warmUp: warmUpResults,
    missingRequired: envValidation.missing.length > 0 ? envValidation.missing : undefined
  });
};
