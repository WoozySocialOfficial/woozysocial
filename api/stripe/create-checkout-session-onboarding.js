const Stripe = require("stripe");
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

// Price ID mapping for each tier
const PRICE_IDS = {
  monthly: {
    solo: process.env.STRIPE_PRICE_SOLO,
    pro: process.env.STRIPE_PRICE_PRO,
    "pro-plus": process.env.STRIPE_PRICE_PRO_PLUS,
    agency: process.env.STRIPE_PRICE_AGENCY,
  },
  annual: {
    solo: process.env.STRIPE_PRICE_SOLO_ANNUAL,
    pro: process.env.STRIPE_PRICE_PRO_ANNUAL,
    "pro-plus": process.env.STRIPE_PRICE_PRO_PLUS_ANNUAL,
    agency: process.env.STRIPE_PRICE_AGENCY_ANNUAL,
  },
};

/**
 * Create Stripe checkout session for new user onboarding
 * This is separate from the regular checkout to handle onboarding-specific logic
 * POST /api/stripe/create-checkout-session-onboarding
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

  // Verify API key for security
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    return sendError(
      res,
      "Unauthorized",
      ErrorCodes.AUTH_INVALID
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
    const {
      userId,
      workspaceId,
      tier,
      email,
      fullName,
      workspaceName,
      successUrl,
      cancelUrl,
      billingPeriod = 'monthly'
    } = req.body;

    // Validate required fields (workspaceName is optional, we'll get it from DB if missing)
    const validation = validateRequired(req.body, [
      "userId",
      "workspaceId",
      "tier",
      "email",
      "fullName"
    ]);

    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(", ")}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Get workspace name from database if not provided
    let finalWorkspaceName = workspaceName;
    if (!finalWorkspaceName) {
      console.log("[ONBOARDING CHECKOUT] workspaceName not provided, fetching from database");
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .single();

      finalWorkspaceName = workspace?.name || 'My Business';
      console.log("[ONBOARDING CHECKOUT] Using workspace name from DB:", finalWorkspaceName);
    }

    // Validate billing period
    if (!['monthly', 'annual'].includes(billingPeriod)) {
      return sendError(
        res,
        `Invalid billing period: ${billingPeriod}. Valid values: monthly, annual`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate tier
    if (!PRICE_IDS[billingPeriod].hasOwnProperty(tier)) {
      return sendError(
        res,
        `Invalid tier: ${tier}. Valid tiers: ${Object.keys(PRICE_IDS[billingPeriod]).join(", ")}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const priceId = PRICE_IDS[billingPeriod][tier];
    if (!priceId) {
      return sendError(
        res,
        `Price not configured for tier: ${tier} with ${billingPeriod} billing`,
        ErrorCodes.CONFIG_ERROR
      );
    }

    console.log("[ONBOARDING CHECKOUT] Creating session for:", { userId, tier, billingPeriod, email });

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      console.log("[ONBOARDING CHECKOUT] Creating new Stripe customer");
      const customer = await stripe.customers.create({
        email: email.toLowerCase(),
        name: fullName,
        metadata: {
          supabase_user_id: userId,
          workspace_id: workspaceId,
          onboarding: 'true'
        }
      });

      customerId = customer.id;

      // Save customer ID to database
      await supabase
        .from('user_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);

      console.log("[ONBOARDING CHECKOUT] Stripe customer created:", customerId);
    } else {
      console.log("[ONBOARDING CHECKOUT] Using existing Stripe customer:", customerId);
    }

    // Determine URLs
    const marketingSiteUrl = process.env.MARKETING_SITE_URL || 'https://www.woozysocials.com';
    const finalSuccessUrl = successUrl || `${marketingSiteUrl}/signup/success`;
    const finalCancelUrl = cancelUrl || `${marketingSiteUrl}/signup?step=4&payment=cancelled`;

    // Create checkout session
    const sessionConfig = {
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode: "subscription",
      success_url: `${finalSuccessUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: finalCancelUrl,
      subscription_data: {
        metadata: {
          supabase_user_id: userId,
          workspace_id: workspaceId,
          workspace_name: finalWorkspaceName,
          tier: tier,
          billing_period: billingPeriod,
          onboarding: 'true'
        }
      },
      metadata: {
        supabase_user_id: userId,
        workspace_id: workspaceId,
        workspace_name: finalWorkspaceName,
        tier: tier,
        billing_period: billingPeriod,
        onboarding: 'true'
      },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer_update: {
        address: "auto",
        name: "auto"
      }
    };

    console.log("[ONBOARDING CHECKOUT] Creating session with config:", {
      tier,
      billingPeriod,
      priceId,
      customerId,
      metadata: sessionConfig.metadata
    });

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log("[ONBOARDING CHECKOUT] Session created:", session.id);

    return sendSuccess(res, {
      sessionId: session.id,
      checkoutUrl: session.url
    });

  } catch (error) {
    console.error("[ONBOARDING CHECKOUT ERROR]", {
      errorType: error.type,
      errorMessage: error.message,
      errorCode: error.code,
      timestamp: new Date().toISOString()
    });

    logError("onboarding-checkout", error, {
      tier: req.body?.tier,
      userId: req.body?.userId
    });

    // Handle Stripe-specific errors
    if (error.type === "StripeInvalidRequestError") {
      return sendError(
        res,
        `Invalid request to payment provider: ${error.message}`,
        ErrorCodes.VALIDATION_ERROR,
        { stripeError: error.message }
      );
    }

    return sendError(
      res,
      "Failed to create checkout session",
      ErrorCodes.INTERNAL_ERROR,
      { errorMessage: error.message }
    );
  }
};
