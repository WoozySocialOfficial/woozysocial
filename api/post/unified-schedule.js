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
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  isServiceConfigured
} = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";
const AYRSHARE_CACHE_TTL = 120; // Cache Ayrshare responses for 2 minutes

/**
 * Unified Schedule Endpoint
 *
 * This endpoint provides a single source of truth for scheduled posts by:
 * 1. Fetching all posts from Supabase database (including pending, approved, scheduled, posted)
 * 2. Enriching with Ayrshare data only for posts that have been published
 * 3. Using ayr_post_id as the deduplication key to prevent duplicate entries
 * 4. Returning properly merged data with correct approval statuses
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { workspaceId, userId, status } = req.query;

    if (!workspaceId || !userId) {
      return sendError(res, "workspaceId and userId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId) || !isValidUUID(userId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    // Verify user is a member of the workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      logError('unified-schedule.checkMembership', membershipError, { userId, workspaceId });
    }

    if (!membership) {
      return sendError(res, "You are not a member of this workspace", ErrorCodes.FORBIDDEN);
    }

    // Step 1: Fetch ALL posts from database (single source of truth)
    let query = supabase
      .from('posts')
      .select(`
        id,
        caption,
        platforms,
        media_urls,
        scheduled_at,
        status,
        approval_status,
        requires_approval,
        created_at,
        user_id,
        created_by,
        ayr_post_id,
        posted_at,
        last_error
      `)
      .eq('workspace_id', workspaceId)
      .order('scheduled_at', { ascending: true });

    // Filter by approval status if provided
    if (status && status !== 'all') {
      query = query.eq('approval_status', status);
    }

    const { data: dbPosts, error: dbError } = await query;

    if (dbError) {
      logError('unified-schedule.fetchPosts', dbError, { workspaceId });
      return sendError(res, "Failed to fetch posts", ErrorCodes.DATABASE_ERROR);
    }

    // Step 2: Fetch Ayrshare history for enrichment (optional, non-blocking, cached)
    let ayrshareHistory = [];
    const profileKey = await getWorkspaceProfileKey(workspaceId);
    const cacheKey = profileKey ? `ayrshare:history:${profileKey}` : null;

    if (profileKey && isServiceConfigured('ayrshare')) {
      // Try KV cache first
      if (kv && cacheKey) {
        try {
          const cached = await kv.get(cacheKey);
          if (cached) {
            ayrshareHistory = cached;
          }
        } catch (cacheErr) {
          // Ignore cache read errors
        }
      }

      // If no cache hit, fetch from Ayrshare
      if (ayrshareHistory.length === 0) {
        try {
          const response = await axios.get(`${BASE_AYRSHARE}/history`, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
              "Profile-Key": profileKey
            },
            timeout: 15000
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
          // Non-blocking: continue without Ayrshare data
          logError('unified-schedule.ayrshare', axiosError);
        }
      }
    }

    // Step 3: Create a map of Ayrshare posts by ID for quick lookup
    const ayrshareMap = {};
    ayrshareHistory.forEach(ayrPost => {
      ayrshareMap[ayrPost.id] = ayrPost;
    });

    // Step 4: Fetch creator info for all posts
    const creatorIds = [...new Set(dbPosts.map(p => p.created_by || p.user_id).filter(Boolean))];
    let creatorProfiles = {};

    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', creatorIds);

      if (profiles) {
        creatorProfiles = profiles.reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    // Step 5: Fetch comment counts for all posts
    const postIds = dbPosts.map(p => p.id);
    let commentCounts = {};

    if (postIds.length > 0) {
      const { data: comments } = await supabase
        .from('post_comments')
        .select('post_id')
        .in('post_id', postIds);

      if (comments) {
        comments.forEach(c => {
          commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1;
        });
      }
    }

    // Step 6: Merge database posts with Ayrshare data (if available)
    const unifiedPosts = dbPosts.map(dbPost => {
      const ayrPost = dbPost.ayr_post_id ? ayrshareMap[dbPost.ayr_post_id] : null;
      const creatorId = dbPost.created_by || dbPost.user_id;
      const creator = creatorProfiles[creatorId] || null;

      // Base post data from database (source of truth)
      const unifiedPost = {
        // Primary fields
        id: dbPost.id,
        content: dbPost.caption || "",
        platforms: dbPost.platforms || [],
        scheduleDate: dbPost.scheduled_at,
        status: dbPost.status,

        // Approval fields (always from database)
        approvalStatus: dbPost.approval_status || 'pending',
        requiresApproval: dbPost.requires_approval !== false,

        // Media
        mediaUrls: dbPost.media_urls || [],

        // Metadata
        created_at: dbPost.created_at,
        posted_at: dbPost.posted_at,
        last_error: dbPost.last_error,

        // Source tracking
        source: 'database',
        ayr_post_id: dbPost.ayr_post_id,

        // Creator info
        user_profiles: creator,
        creator_name: creator?.full_name || creator?.email || 'Unknown',

        // Comments
        comments: [],
        commentCount: commentCounts[dbPost.id] || 0,

        // Map to frontend expected field names (for backwards compatibility)
        post: dbPost.caption,
        schedule_date: dbPost.scheduled_at,
        media_url: dbPost.media_urls?.[0] || null,
      };

      // Enrich with Ayrshare data if available (for published posts)
      if (ayrPost) {
        unifiedPost.ayrshareData = {
          postId: ayrPost.id,
          status: ayrPost.status,
          type: ayrPost.type,
          // Additional Ayrshare fields can be added here if needed
        };
      }

      return unifiedPost;
    });

    // Step 7: Group by approval status for UI convenience
    const grouped = {
      pending: unifiedPosts.filter(p => p.approvalStatus === 'pending'),
      changes_requested: unifiedPosts.filter(p => p.approvalStatus === 'changes_requested'),
      approved: unifiedPosts.filter(p => p.approvalStatus === 'approved'),
      rejected: unifiedPosts.filter(p => p.approvalStatus === 'rejected')
    };

    return sendSuccess(res, {
      posts: unifiedPosts,
      grouped: grouped,
      counts: {
        pending: grouped.pending.length,
        changes_requested: grouped.changes_requested.length,
        approved: grouped.approved.length,
        rejected: grouped.rejected.length,
        total: unifiedPosts.length
      },
      userRole: membership.role
    });

  } catch (error) {
    logError('unified-schedule.handler', error);
    return sendError(res, "Failed to fetch unified schedule", ErrorCodes.INTERNAL_ERROR);
  }
};
