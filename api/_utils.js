const { createClient } = require("@supabase/supabase-js");

// ============================================
// ERROR CODES
// ============================================
const ErrorCodes = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR'
};

// HTTP status codes mapping
const ErrorStatusCodes = {
  [ErrorCodes.AUTH_REQUIRED]: 401,
  [ErrorCodes.AUTH_INVALID]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.RATE_LIMITED]: 429,
  [ErrorCodes.SUBSCRIPTION_REQUIRED]: 402,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.METHOD_NOT_ALLOWED]: 405,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.EXTERNAL_API_ERROR]: 502,
  [ErrorCodes.CONFIG_ERROR]: 500
};

// ============================================
// RESPONSE HELPERS
// ============================================

/**
 * Send a standardized success response
 * @param {object} res - Express/Vercel response object
 * @param {object} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendSuccess(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data
  });
}

/**
 * Send a standardized error response
 * @param {object} res - Express/Vercel response object
 * @param {string} message - Human-readable error message
 * @param {string} code - Error code from ErrorCodes
 * @param {object} details - Optional additional details (hidden in production)
 * @param {number} statusCode - Override HTTP status code
 */
function sendError(res, message, code = ErrorCodes.INTERNAL_ERROR, details = null, statusCode = null) {
  const status = statusCode || ErrorStatusCodes[code] || 500;
  const response = {
    success: false,
    error: message,
    code
  };

  // Only include details in non-production or if explicitly safe
  if (details && process.env.NODE_ENV !== 'production') {
    response.details = details;
  }

  return res.status(status).json(response);
}

/**
 * Log error with context (safe for production)
 * @param {string} context - Where the error occurred
 * @param {Error|string} error - The error object or message
 * @param {object} meta - Additional metadata (will be sanitized)
 */
function logError(context, error, meta = {}) {
  // Sanitize meta to remove sensitive data
  const sanitizedMeta = { ...meta };
  const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'authorization', 'key'];
  sensitiveKeys.forEach(key => {
    Object.keys(sanitizedMeta).forEach(metaKey => {
      if (metaKey.toLowerCase().includes(key.toLowerCase())) {
        sanitizedMeta[metaKey] = '[REDACTED]';
      }
    });
  });

  console.error(`[ERROR] ${context}:`, {
    message: error?.message || error,
    stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
    ...sanitizedMeta,
    timestamp: new Date().toISOString()
  });
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate required fields in request body
 * @param {object} body - Request body
 * @param {string[]} requiredFields - Array of required field names
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateRequired(body, requiredFields) {
  const missing = requiredFields.filter(field => {
    const value = body[field];
    return value === undefined || value === null || value === '';
  });

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Validate field types
 * @param {object} body - Request body
 * @param {object} schema - Schema object { fieldName: 'string' | 'number' | 'boolean' | 'array' | 'object' }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTypes(body, schema) {
  const errors = [];

  Object.entries(schema).forEach(([field, expectedType]) => {
    const value = body[field];
    if (value === undefined || value === null) return; // Skip undefined/null (use validateRequired for that)

    let actualType = typeof value;
    if (Array.isArray(value)) actualType = 'array';

    if (actualType !== expectedType) {
      errors.push(`Field '${field}' must be of type '${expectedType}', got '${actualType}'`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && emailRegex.test(email);
}

/**
 * Validate UUID format
 * @param {string} uuid
 * @returns {boolean}
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof uuid === 'string' && uuidRegex.test(uuid);
}

// ============================================
// RATE LIMITING
// ============================================

// In-memory rate limit store (consider Redis for production with multiple instances)
const rateLimitStore = new Map();

/**
 * Clean up expired rate limit entries (run periodically)
 */
function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);

/**
 * Check rate limit for a given identifier
 * @param {string} identifier - Unique identifier (userId, IP, etc.)
 * @param {string} action - Action being rate limited (e.g., 'post', 'auth')
 * @param {object} options - Rate limit options
 * @param {number} options.maxRequests - Maximum requests allowed (default: 10)
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns {{ allowed: boolean, remaining: number, resetIn: number }}
 */
function checkRateLimit(identifier, action, options = {}) {
  const { maxRequests = 10, windowMs = 60000 } = options;
  const key = `${action}:${identifier}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // Create new entry or reset if window expired
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      resetTime: now + windowMs
    };
  }

  entry.count++;
  rateLimitStore.set(key, entry);

  const remaining = Math.max(0, maxRequests - entry.count);
  const resetIn = Math.max(0, entry.resetTime - now);

  return {
    allowed: entry.count <= maxRequests,
    remaining,
    resetIn
  };
}

/**
 * Rate limit middleware helper
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {string} action - Action being rate limited
 * @param {object} options - Rate limit options
 * @returns {boolean} - Returns true if request should be blocked
 */
function applyRateLimit(req, res, action, options = {}) {
  // Get identifier from user ID or IP
  const identifier = req.headers['x-user-id'] ||
                     req.headers['x-forwarded-for']?.split(',')[0] ||
                     req.socket?.remoteAddress ||
                     'unknown';

  const result = checkRateLimit(identifier, action, options);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetIn / 1000));

  if (!result.allowed) {
    sendError(
      res,
      `Too many requests. Please try again in ${Math.ceil(result.resetIn / 1000)} seconds.`,
      ErrorCodes.RATE_LIMITED
    );
    return true; // Request blocked
  }

  return false; // Request allowed
}

// ============================================
// ENVIRONMENT VALIDATION
// ============================================

/**
 * Required environment variables for the application
 */
const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

/**
 * Optional but recommended environment variables
 */
const OPTIONAL_ENV_VARS = [
  'AYRSHARE_API_KEY',
  'AYRSHARE_PROFILE_KEY',
  'AYRSHARE_PRIVATE_KEY',
  'AYRSHARE_DOMAIN',
  'OPENAI_API_KEY',
  'RESEND_API_KEY',
  'APP_URL',
  'FRONTEND_URL'
];

/**
 * Validate environment variables on startup
 * @returns {{ valid: boolean, missing: string[], warnings: string[] }}
 */
function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  const warnings = OPTIONAL_ENV_VARS.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error('[CONFIG ERROR] Missing required environment variables:', missing);
  }

  if (warnings.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn('[CONFIG WARNING] Missing optional environment variables:', warnings);
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings
  };
}

/**
 * Check if a specific service is configured
 * @param {string} service - Service name ('supabase', 'ayrshare', 'openai', 'resend')
 * @returns {boolean}
 */
function isServiceConfigured(service) {
  const serviceConfigs = {
    supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    ayrshare: ['AYRSHARE_API_KEY'],
    ayrshareJwt: ['AYRSHARE_PRIVATE_KEY', 'AYRSHARE_DOMAIN'],
    openai: ['OPENAI_API_KEY'],
    resend: ['RESEND_API_KEY']
  };

  const required = serviceConfigs[service];
  if (!required) return false;

  return required.every(v => !!process.env[v]);
}

// ============================================
// REQUEST HANDLER WRAPPER
// ============================================

/**
 * Wrap an API handler with standardized error handling
 * @param {function} handler - Async handler function (req, res) => Promise<void>
 * @param {object} options - Options
 * @param {string[]} options.allowedMethods - Allowed HTTP methods (default: ['GET', 'POST'])
 * @param {string} options.rateLimitAction - Action name for rate limiting (optional)
 * @param {object} options.rateLimitOptions - Rate limit options (optional)
 * @returns {function} - Wrapped handler
 */
function withErrorHandler(handler, options = {}) {
  const {
    allowedMethods = ['GET', 'POST'],
    rateLimitAction = null,
    rateLimitOptions = {}
  } = options;

  return async (req, res) => {
    // Set CORS headers
    setCors(res);

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Method validation
    if (!allowedMethods.includes(req.method)) {
      return sendError(
        res,
        `Method ${req.method} not allowed. Allowed methods: ${allowedMethods.join(', ')}`,
        ErrorCodes.METHOD_NOT_ALLOWED
      );
    }

    // Apply rate limiting if configured
    if (rateLimitAction) {
      const blocked = applyRateLimit(req, res, rateLimitAction, rateLimitOptions);
      if (blocked) return;
    }

    try {
      await handler(req, res);
    } catch (error) {
      logError('Unhandled API error', error, {
        method: req.method,
        url: req.url
      });

      // Check for specific error types
      if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
        return sendError(res, 'Authentication failed', ErrorCodes.AUTH_INVALID);
      }

      if (error.code?.startsWith('PGRST')) {
        return sendError(res, 'Database operation failed', ErrorCodes.DATABASE_ERROR, error.message);
      }

      return sendError(
        res,
        'An unexpected error occurred',
        ErrorCodes.INTERNAL_ERROR,
        error.message
      );
    }
  };
}

// ============================================
// SUPABASE CLIENT (existing)
// ============================================

// Lazy initialization of Supabase client
let _supabase = null;
function getSupabase() {
  if (!_supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

// Helper function to get user's profile key
async function getUserProfileKey(userId) {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('ayr_profile_key')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data?.ayr_profile_key || null;
  } catch (error) {
    console.error('Error fetching user profile key:', error);
    return null;
  }
}

// Helper function to get workspace's profile key directly by workspace ID
async function getWorkspaceProfileKey(workspaceId) {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('ayr_profile_key')
      .eq('id', workspaceId)
      .single();

    if (error) throw error;
    return data?.ayr_profile_key || null;
  } catch (error) {
    console.error('Error fetching workspace profile key:', error);
    return null;
  }
}

// Helper function to get workspace's profile key for a user (handles team inheritance)
async function getWorkspaceProfileKeyForUser(userId) {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    // First, check if user is a member of any workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking workspace membership:', membershipError);
      return null;
    }

    if (membership) {
      // User is a workspace member, get the workspace's profile key
      const workspaceProfileKey = await getWorkspaceProfileKey(membership.workspace_id);
      if (workspaceProfileKey) {
        return workspaceProfileKey;
      }
    }

    // User is not a workspace member or workspace has no profile key
    // Fall back to user's own profile key
    return await getUserProfileKey(userId);
  } catch (error) {
    console.error('Error fetching workspace profile key for user:', error);
    return null;
  }
}

// CORS headers helper
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
}

// Parse JSON body helper
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body) {
      resolve(req.body);
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = {
  // Existing exports
  getSupabase,
  getUserProfileKey,
  getWorkspaceProfileKey,
  getWorkspaceProfileKeyForUser,
  setCors,
  parseBody,

  // Error handling
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,

  // Validation
  validateRequired,
  validateTypes,
  isValidEmail,
  isValidUUID,

  // Rate limiting
  checkRateLimit,
  applyRateLimit,

  // Environment
  validateEnv,
  isServiceConfigured,

  // Request wrapper
  withErrorHandler
};
