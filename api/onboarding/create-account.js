/**
 * Create Account Proxy Endpoint
 * Proxies requests to the locked /api/signup/create-account endpoint
 * Creates user account and workspace, returns userId and workspaceId for checkout
 */

const axios = require('axios');

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      fullName,
      email,
      password,
      workspaceName,
      questionnaireAnswers,
      selectedTier
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !workspaceName || !selectedTier) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'fullName, email, password, workspaceName, and selectedTier are required'
      });
    }

    // Get the API secret key from environment
    const apiKey = process.env.API_SECRET_KEY;
    if (!apiKey) {
      console.error('[CREATE-ACCOUNT] API_SECRET_KEY not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Construct the target URL using the request host
    const baseUrl = `https://${req.headers.host}`;
    const targetUrl = `${baseUrl}/api/signup/create-account`;

    console.log('[CREATE-ACCOUNT] Proxying to:', targetUrl);
    console.log('[CREATE-ACCOUNT] Payload:', {
      fullName,
      email,
      workspaceName,
      selectedTier,
      hasPassword: !!password
    });

    // Call the locked endpoint with API key
    const response = await axios.post(
      targetUrl,
      {
        fullName,
        email,
        password,
        workspaceName,
        questionnaireAnswers,
        selectedTier
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[CREATE-ACCOUNT] Success:', {
      userId: response.data.data?.userId || response.data.userId,
      workspaceId: response.data.data?.workspaceId || response.data.workspaceId
    });

    // Extract the data (handle both { data: { userId, workspaceId } } and flat structure)
    const responseData = response.data.data || response.data;

    // Ensure we're returning userId and workspaceId
    if (!responseData.userId || !responseData.workspaceId) {
      console.error('[CREATE-ACCOUNT] WARNING: Missing userId or workspaceId in response!');
      console.error('[CREATE-ACCOUNT] Full response:', JSON.stringify(response.data, null, 2));
      return res.status(500).json({
        error: 'Account creation incomplete',
        message: 'Failed to retrieve user or workspace ID'
      });
    }

    // Return flattened structure for frontend
    res.status(200).json({
      userId: responseData.userId,
      workspaceId: responseData.workspaceId,
      message: responseData.message || 'Account created successfully'
    });

  } catch (error) {
    console.error('[CREATE-ACCOUNT] Error:', error.message);

    if (error.response) {
      console.error('[CREATE-ACCOUNT] Response:', error.response.data);
      console.error('[CREATE-ACCOUNT] Status:', error.response.status);

      // Forward the error from the locked endpoint
      return res.status(error.response.status).json({
        error: 'Failed to create account',
        message: error.response.data?.message || error.message,
        details: error.response.data
      });
    }

    // Generic error
    res.status(500).json({
      error: 'Failed to create account',
      message: error.message
    });
  }
};
