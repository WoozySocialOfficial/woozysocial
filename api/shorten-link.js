const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendError,
  logError,
  validateRequired,
  isValidUUID
} = require("./_utils");

// Generate a random short code (6 characters)
function generateShortCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get base URL for short links
function getBaseUrl() {
  return process.env.APP_URL || process.env.FRONTEND_URL || 'https://woozysocials.com';
}

/**
 * POST /api/shorten-link
 * Creates a shortened, trackable link
 *
 * Body:
 * - url: The URL to shorten (required)
 * - workspaceId: The workspace ID (required)
 * - userId: The user creating the link (optional)
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { url, workspaceId, userId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['url', 'workspaceId']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return sendError(res, "Invalid URL format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate workspaceId format
    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspace ID", ErrorCodes.VALIDATION_ERROR);
    }

    // Generate unique short code
    let shortCode;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      shortCode = generateShortCode();

      // Check if code already exists
      const { data: existing } = await supabase
        .from('short_links')
        .select('id')
        .eq('short_code', shortCode)
        .single();

      if (!existing) break;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return sendError(res, "Failed to generate unique short code", ErrorCodes.INTERNAL_ERROR);
    }

    // Create the short link
    const { data: newLink, error: insertError } = await supabase
      .from('short_links')
      .insert({
        workspace_id: workspaceId,
        user_id: userId || null,
        short_code: shortCode,
        original_url: url
      })
      .select()
      .single();

    if (insertError) {
      logError('Create short link', insertError, { workspaceId, url });
      return sendError(res, "Failed to create short link", ErrorCodes.DATABASE_ERROR);
    }

    const baseUrl = getBaseUrl();
    const shortLink = `${baseUrl}/l/${shortCode}`;

    return res.status(201).json({
      success: true,
      id: newLink.id,
      shortCode: shortCode,
      shortLink: shortLink,
      originalUrl: url,
      clickCount: 0
    });

  } catch (error) {
    logError('Shorten link API', error);
    return sendError(res, "An unexpected error occurred", ErrorCodes.INTERNAL_ERROR);
  }
};
