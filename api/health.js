const {
  setCors,
  sendSuccess,
  validateEnv
} = require("./_utils");

module.exports = function handler(req, res) {
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
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY
  };

  return sendSuccess(res, {
    status: envValidation.valid ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    env: envStatus,
    missingRequired: envValidation.missing.length > 0 ? envValidation.missing : undefined
  });
};
