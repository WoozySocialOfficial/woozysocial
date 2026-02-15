/**
 * Validate Email Proxy Endpoint
 * Proxies requests to the locked /api/signup/validate-email endpoint
 * This allows the frontend to check email availability without exposing the API key
 */

const axios = require('axios');

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Get the API secret key from environment
    const apiKey = process.env.API_SECRET_KEY;
    if (!apiKey) {
      console.error('[VALIDATE-EMAIL] API_SECRET_KEY not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Construct the target URL using the request host
    const baseUrl = `https://${req.headers.host}`;
    const targetUrl = `${baseUrl}/api/signup/validate-email`;

    console.log('[VALIDATE-EMAIL] Proxying to:', targetUrl);

    // Call the locked endpoint with API key
    const response = await axios.post(
      targetUrl,
      { email },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    // Return the response from the locked endpoint
    res.status(200).json(response.data);

  } catch (error) {
    console.error('[VALIDATE-EMAIL] Error:', error.message);

    if (error.response) {
      // Forward the error from the locked endpoint
      return res.status(error.response.status).json(error.response.data);
    }

    // Generic error
    res.status(500).json({
      error: 'Failed to validate email',
      message: error.message
    });
  }
};
