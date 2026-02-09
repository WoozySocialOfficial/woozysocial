const Stripe = require("stripe");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  validateRequired,
  logError,
  applyRateLimit,
} = require("../_utils");

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  setCors(res, req);

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

  // Rate limit: 10 portal sessions per minute per user
  const rateLimited = applyRateLimit(req, res, "stripe-portal", {
    maxRequests: 10,
    windowMs: 60000,
  });
  if (rateLimited) return;

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
    const { userId, returnUrl } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ["userId"]);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(", ")}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from("user_profiles")
      .select("id, email, stripe_customer_id")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      logError("stripe-portal", userError, { userId });
      return sendError(res, "User not found", ErrorCodes.NOT_FOUND);
    }

    if (!user.stripe_customer_id) {
      return sendError(
        res,
        "No subscription found. Please subscribe first.",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Create portal session
    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: returnUrl || `${appUrl}/settings`,
    });

    return sendSuccess(res, {
      url: session.url,
    });
  } catch (error) {
    logError("stripe-portal", error);

    if (error.type === "StripeInvalidRequestError") {
      return sendError(
        res,
        "Unable to create portal session. Please contact support.",
        ErrorCodes.EXTERNAL_API_ERROR
      );
    }

    return sendError(
      res,
      "Failed to create portal session",
      ErrorCodes.INTERNAL_ERROR
    );
  }
};
