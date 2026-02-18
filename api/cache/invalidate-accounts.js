const {
  setCors,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError
} = require("../_utils");

let kv;
try {
  kv = require("@vercel/kv").kv;
} catch (e) {
  kv = null;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  // Gracefully handle KV not being available (e.g., in development)
  if (!kv) {
    console.log("[invalidate-accounts] KV not available, skipping cache invalidation");
    return sendSuccess(res, {
      message: "KV not available, cache invalidation skipped"
    });
  }

  try {
    const { profileKey } = req.body || req.query;

    if (!profileKey) {
      return sendError(res, "profileKey required", ErrorCodes.VALIDATION_ERROR);
    }

    // Delete the user accounts cache for this profile
    const cacheKey = `ayrshare:user:${profileKey}`;
    await kv.del(cacheKey);
    console.log(`[invalidate-accounts] Cache cleared for profile: ${profileKey.substring(0, 8)}...`);

    return sendSuccess(res, {
      message: "Account cache invalidated successfully",
      profileKey: profileKey.substring(0, 8) + '...',
      cacheKey
    });

  } catch (error) {
    logError('cache.invalidate-accounts.handler', error);
    // Don't fail the request if cache deletion fails - fail gracefully
    console.error("[invalidate-accounts] Error clearing cache:", error);
    return sendSuccess(res, {
      message: "Cache invalidation attempted but may have failed"
    });
  }
};
