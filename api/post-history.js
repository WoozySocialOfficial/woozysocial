const axios = require("axios");
let kv;
try {
  kv = require("@vercel/kv").kv;
} catch (e) {
  // KV not available in development
  kv = null;
}
const {
  setCors,
  getWorkspaceProfileKey,
  getWorkspaceProfileKeyForUser,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  isServiceConfigured
} = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";
const AYRSHARE_CACHE_TTL = 120; // Cache Ayrshare responses for 2 minutes

module.exports = async function handler(req, res) {
  setCors(res, req);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  try {
    const { userId, workspaceId, lastDays } = req.query;

    if (workspaceId && !isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (userId && !isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get profile key - prefer workspaceId if provided, otherwise use userId fallback
    let profileKey;
    if (workspaceId) {
      profileKey = await getWorkspaceProfileKey(workspaceId);
    }
    if (!profileKey && userId) {
      profileKey = await getWorkspaceProfileKeyForUser(userId);
    }

    if (!profileKey) {
      return sendSuccess(res, { history: [] });
    }

    if (!isServiceConfigured('ayrshare')) {
      return sendError(res, "Social media service is not configured", ErrorCodes.CONFIG_ERROR);
    }

    // Fetch from Ayrshare (with caching)
    let ayrshareHistory = [];
    const cacheKey = `ayrshare:history:${profileKey}`;

    // Try to get from cache first
    if (kv) {
      try {
        const cached = await kv.get(cacheKey);
        if (cached) {
          ayrshareHistory = cached;
        }
      } catch (cacheErr) {
        // Cache miss or error, continue to fetch
      }
    }

    // If not in cache, fetch from Ayrshare
    if (ayrshareHistory.length === 0) {
      try {
        const historyParams = {};
        if (lastDays && !isNaN(Number(lastDays))) {
          historyParams.lastDays = Number(lastDays);
        }
        const response = await axios.get(`${BASE_AYRSHARE}/history`, {
          params: historyParams,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey
          },
          timeout: 30000
        });
        ayrshareHistory = response.data.history || [];

        // Store in cache for next request
        if (kv && ayrshareHistory.length > 0) {
          try {
            await kv.set(cacheKey, ayrshareHistory, { ex: AYRSHARE_CACHE_TTL });
          } catch (setCacheErr) {
            // Ignore cache set errors
          }
        }
      } catch (axiosError) {
        logError('post-history.ayrshare', axiosError);
        // Continue with empty Ayrshare history instead of failing
      }
    }

    // Fetch posts from Supabase (including pending approval)
    let supabasePosts = [];
    const supabase = getSupabase();

    if (workspaceId && supabase) {
      try {
        const { data: dbPosts, error: dbError } = await supabase
          .from('posts')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });

        if (!dbError && dbPosts) {
          supabasePosts = dbPosts.map(post => ({
            id: post.id,
            post: post.caption,
            platforms: post.platforms || [],
            scheduleDate: post.scheduled_at,
            status: post.status === 'pending_approval' ? 'scheduled' : post.status,
            type: post.scheduled_at ? 'schedule' : 'post',
            mediaUrls: post.media_urls || [],
            approval_status: post.approval_status || 'pending',
            requires_approval: post.requires_approval || false,
            comments: [],
            created_at: post.created_at,
            source: 'database',
            ayr_post_id: post.ayr_post_id
          }));
        }
      } catch (dbErr) {
        logError('post-history.supabase', dbErr);
      }
    }

    // Merge: Supabase posts (pending/not in Ayrshare) + Ayrshare history
    const ayrPostIds = new Set(ayrshareHistory.map(p => p.id));

    // Include posts from database if:
    // 1. Pending/rejected approval
    // 2. No ayr_post_id yet (not sent to Ayrshare)
    // 3. Not in Ayrshare history yet (may be recently posted)
    // 4. Posted within last 24 hours (ensure recent activity shows even if Ayrshare is delayed)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pendingPosts = supabasePosts.filter(p => {
      const isRecent = p.created_at && new Date(p.created_at) > oneDayAgo;
      const notInAyrshare = !p.ayr_post_id || !ayrPostIds.has(p.ayr_post_id);
      const needsAttention = p.approval_status === 'pending' || p.approval_status === 'rejected';

      return needsAttention || notInAyrshare || isRecent;
    });

    // Enrich Ayrshare posts with approval status from DB
    const enrichedAyrshare = ayrshareHistory.map(ayrPost => {
      const dbPost = supabasePosts.find(p => p.ayr_post_id === ayrPost.id);
      return {
        ...ayrPost,
        ayr_post_id: ayrPost.id,
        approval_status: dbPost?.approval_status || 'approved',
        requires_approval: dbPost?.requires_approval || false,
        comments: dbPost?.comments || []
      };
    });

    const allHistory = [...pendingPosts, ...enrichedAyrshare];

    return sendSuccess(res, {
      history: allHistory,
      count: allHistory.length
    });

  } catch (error) {
    logError('post-history.handler', error);
    return sendError(res, "Failed to fetch post history", ErrorCodes.INTERNAL_ERROR);
  }
};
