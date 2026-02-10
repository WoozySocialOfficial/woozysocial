const Stripe = require("stripe");
const crypto = require("crypto");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  validateRequired,
  logError
} = require("../_utils");

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Complete onboarding after successful payment
 * Generates one-time login token for auto-login
 * POST /api/signup/complete-onboarding
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

  if (!process.env.STRIPE_SECRET_KEY) {
    return sendError(
      res,
      "Stripe not configured",
      ErrorCodes.CONFIG_ERROR
    );
  }

  try {
    const { sessionId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ["sessionId"]);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(", ")}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    console.log("[COMPLETE ONBOARDING] Processing session:", sessionId);

    // Get session from Stripe to verify payment
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return sendError(
        res,
        "Payment not completed",
        ErrorCodes.VALIDATION_ERROR,
        { paymentStatus: session.payment_status }
      );
    }

    const userId = session.metadata.supabase_user_id;
    const workspaceId = session.metadata.workspace_id;

    if (!userId) {
      return sendError(
        res,
        "Invalid session: missing user ID",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    console.log("[COMPLETE ONBOARDING] Payment verified for user:", userId);

    // Update user profile to mark onboarding as completed
    await supabase
      .from('user_profiles')
      .update({
        onboarding_completed: true,
        onboarding_step: 6 // Completed
      })
      .eq('id', userId);

    console.log("[COMPLETE ONBOARDING] User profile updated");

    // Generate one-time login token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const { error: tokenError } = await supabase
      .from('login_tokens')
      .insert({
        token: token,
        user_id: userId,
        expires_at: expiresAt.toISOString(),
        used: false
      });

    if (tokenError) {
      logError("complete-onboarding-token", tokenError, { userId });
      return sendError(
        res,
        "Failed to create login token",
        ErrorCodes.DATABASE_ERROR
      );
    }

    console.log("[COMPLETE ONBOARDING] Login token created");

    // Get app URL
    const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL || "https://woozysocials.com").trim();

    return sendSuccess(res, {
      loginToken: token,
      dashboardUrl: `${appUrl}/dashboard`,
      message: "Onboarding completed successfully"
    });

  } catch (error) {
    console.error("[COMPLETE ONBOARDING ERROR]", {
      errorType: error.type,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });

    logError("complete-onboarding", error, {
      sessionId: req.body?.sessionId
    });

    // Handle Stripe-specific errors
    if (error.type === "StripeInvalidRequestError") {
      return sendError(
        res,
        "Invalid session ID",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    return sendError(
      res,
      "Failed to complete onboarding",
      ErrorCodes.INTERNAL_ERROR,
      { errorMessage: error.message }
    );
  }
};
