const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  validateRequired,
  logError
} = require("../_utils");

/**
 * Validate one-time login token and create session
 * Used after successful payment from marketing site
 * POST /api/auth/token-login
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(
      res,
      "Method not allowed",
      ErrorCodes.METHOD_NOT_ALLOWED
    );
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(
      res,
      "Database not configured",
      ErrorCodes.CONFIG_ERROR
    );
  }

  try {
    const { token } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ["token"]);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(", ")}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    console.log("[TOKEN LOGIN] Validating token");

    // Validate token from database
    const { data: tokenData, error: tokenError } = await supabase
      .from('login_tokens')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (tokenError || !tokenData) {
      console.log("[TOKEN LOGIN] Token validation failed:", tokenError?.message || "Token not found");
      return sendError(
        res,
        "Invalid or expired token",
        ErrorCodes.AUTH_INVALID
      );
    }

    console.log("[TOKEN LOGIN] Token valid for user:", tokenData.user_id);

    // Mark token as used
    const { error: updateError } = await supabase
      .from('login_tokens')
      .update({
        used: true,
        used_at: new Date().toISOString()
      })
      .eq('token', token);

    if (updateError) {
      logError("token-login-update", updateError, { token: token.substring(0, 10) });
    }

    // Get user details
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name')
      .eq('id', tokenData.user_id)
      .single();

    if (userError || !user) {
      logError("token-login-user", userError, { userId: tokenData.user_id });
      return sendError(
        res,
        "User not found",
        ErrorCodes.NOT_FOUND
      );
    }

    console.log("[TOKEN LOGIN] User found:", user.email);

    // Get the app URL for redirects
    const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL || 'https://api.woozysocial.com').trim();

    // Generate a magic link that the user can be redirected to directly
    // This is more reliable than trying to verify OTP manually
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
      options: {
        redirectTo: `${appUrl}/dashboard?welcome=true`
      }
    });

    if (linkError) {
      console.error("[TOKEN LOGIN] Failed to generate magic link:", linkError.message);
      logError("token-login-link", linkError, { userId: user.id });

      // Fallback: Return user info and redirect to login
      // Users have passwords so they can login manually
      return sendSuccess(res, {
        message: "Token validated - please login with your credentials",
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name
        },
        fallbackToLogin: true,
        loginUrl: `${appUrl}/login?email=${encodeURIComponent(user.email)}&verified=true`
      });
    }

    console.log("[TOKEN LOGIN] Magic link generated successfully");

    // Return the full action_link URL for direct browser redirect
    // This is more reliable than manual OTP verification
    return sendSuccess(res, {
      message: "Token validated successfully",
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name
      },
      // Return the magic link URL for direct browser redirect
      magicLink: linkData.properties?.action_link,
      // Also return fallback in case magic link doesn't work
      fallbackLoginUrl: `${appUrl}/login?email=${encodeURIComponent(user.email)}&verified=true`
    });

  } catch (error) {
    logError("token-login", error);
    return sendError(
      res,
      "Failed to validate token",
      ErrorCodes.INTERNAL_ERROR,
      error.message
    );
  }
};
