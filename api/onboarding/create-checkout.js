/**
 * Create Checkout Session Proxy Endpoint
 * Proxies requests to the locked /api/stripe/create-checkout-session-onboarding endpoint
 * Creates a Stripe checkout session for new signups
 */

const axios = require('axios');

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, workspaceId, tier, email, fullName } = req.body;

    // Validate required fields
    if (!userId || !workspaceId || !tier) {
      console.error('[CREATE-CHECKOUT] Missing fields:', { userId, workspaceId, tier });
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'userId, workspaceId, and tier are required',
        received: { userId, workspaceId, tier, email, fullName }
      });
    }

    // Get the API secret key from environment
    const apiKey = process.env.API_SECRET_KEY;
    if (!apiKey) {
      console.error('[CREATE-CHECKOUT] API_SECRET_KEY not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Construct the target URL using the request host
    const baseUrl = `https://${req.headers.host}`;
    const targetUrl = `${baseUrl}/api/stripe/create-checkout-session-onboarding`;

    // Determine frontend URL based on environment
    let frontendUrl;

    // Check if we're on Vercel (VERCEL_URL is set for all Vercel deployments)
    if (process.env.VERCEL_URL) {
      // Use the Vercel deployment URL (works for both preview and production)
      frontendUrl = `https://${process.env.VERCEL_URL}`;
    } else if (req.headers.host.includes('api.')) {
      // Fallback: Strip API subdomain for production
      frontendUrl = baseUrl.replace('api.woozysocials.com', 'www.woozysocials.com')
                           .replace('api.woozysocial.com', 'www.woozysocial.com');
    } else {
      // Use the request host as-is
      frontendUrl = baseUrl;
    }

    const successUrl = `${frontendUrl}/get-started/success`;
    const cancelUrl = `${frontendUrl}/get-started?step=4&payment=cancelled`;

    console.log('[CREATE-CHECKOUT] Environment:', {
      VERCEL_URL: process.env.VERCEL_URL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      requestHost: req.headers.host
    });
    console.log('[CREATE-CHECKOUT] Frontend URL:', frontendUrl);
    console.log('[CREATE-CHECKOUT] Proxying to:', targetUrl);
    console.log('[CREATE-CHECKOUT] Payload:', {
      userId,
      workspaceId,
      tier,
      email,
      fullName,
      successUrl,
      cancelUrl
    });

    // Call the locked endpoint with API key
    const response = await axios.post(
      targetUrl,
      {
        userId,
        workspaceId,
        tier,
        email,
        fullName,
        successUrl,
        cancelUrl
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[CREATE-CHECKOUT] Response received');

    // Extract the data (handle both { data: { checkoutUrl, sessionId } } and flat structure)
    const checkoutData = response.data.data || response.data;

    console.log('[CREATE-CHECKOUT] Returning:', {
      hasCheckoutUrl: !!checkoutData.checkoutUrl,
      hasSessionId: !!checkoutData.sessionId
    });

    // Ensure we have a checkout URL
    if (!checkoutData.checkoutUrl) {
      console.error('[CREATE-CHECKOUT] WARNING: Missing checkoutUrl in response!');
      console.error('[CREATE-CHECKOUT] Full response:', JSON.stringify(response.data, null, 2));
      return res.status(500).json({
        error: 'Checkout creation incomplete',
        message: 'Failed to retrieve checkout URL'
      });
    }

    // Return the checkout data
    res.status(200).json({
      checkoutUrl: checkoutData.checkoutUrl,
      sessionId: checkoutData.sessionId
    });

  } catch (error) {
    console.error('[CREATE-CHECKOUT] Error:', error.message);

    if (error.response) {
      console.error('[CREATE-CHECKOUT] Response:', error.response.data);
      console.error('[CREATE-CHECKOUT] Status:', error.response.status);

      // Forward the error from the locked endpoint
      return res.status(error.response.status).json({
        error: 'Failed to create checkout session',
        message: error.response.data?.message || error.message,
        details: error.response.data
      });
    }

    // Generic error
    res.status(500).json({
      error: 'Failed to create checkout session',
      message: error.message
    });
  }
};
