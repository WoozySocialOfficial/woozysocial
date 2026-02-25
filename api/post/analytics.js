const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * GET /api/post/analytics
 * Fetches analytics for a specific post from Ayrshare
 *
 * Query params:
 * - postId: Required Ayrshare post ID
 * - workspaceId: Required workspace ID
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  try {
    const { postId, workspaceId } = req.query;

    // Validate required fields
    if (!postId) {
      return sendError(res, "postId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!workspaceId) {
      return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get workspace profile key
    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(
        res,
        "No Ayrshare profile found for this workspace",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    console.log('[ANALYTICS] Fetching analytics for post:', { postId, workspaceId });

    // Get Supabase client
    const supabase = getSupabase();

    // Try to get post from database first
    let post = null;
    if (supabase) {
      const { data } = await supabase
        .from('posts')
        .select('id, analytics, analytics_updated_at, platforms')
        .eq('ayr_post_id', postId)
        .eq('workspace_id', workspaceId)
        .single();

      post = data;
    }

    // Fetch analytics from Ayrshare using the correct endpoint
    // API requires POST with JSON body: {"id": "postId", "platforms": [...]}
    try {
      const requestBody = {
        id: postId
      };

      // Add platforms if we have them from the database
      if (post && post.platforms && post.platforms.length > 0) {
        requestBody.platforms = post.platforms;
      }

      console.log('[ANALYTICS] Request body:', JSON.stringify(requestBody));

      const response = await axios.post(
        `${BASE_AYRSHARE}/analytics/post`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey
          },
          timeout: 30000
        }
      );

      if (!response.data) {
        return sendError(
          res,
          "No analytics data returned from Ayrshare",
          ErrorCodes.EXTERNAL_API_ERROR
        );
      }

      console.log('[ANALYTICS] Raw Ayrshare response:', JSON.stringify(response.data, null, 2));

      // Save raw analytics to database
      if (supabase && post) {
        await supabase
          .from('posts')
          .update({
            analytics: response.data,
            analytics_updated_at: new Date().toISOString()
          })
          .eq('id', post.id);
      }

      // Normalize the analytics data
      const normalizedData = normalizeAnalytics(response.data, postId);

      return sendSuccess(res, normalizedData);

    } catch (ayrshareError) {
      const statusCode = ayrshareError.response?.status;
      const responseData = ayrshareError.response?.data;

      console.error('[ANALYTICS] Ayrshare fetch failed:', {
        status: statusCode,
        data: responseData,
        message: ayrshareError.message
      });

      // Try to fall back to cached analytics from database
      if (post && post.analytics && Object.keys(post.analytics).length > 0) {
        console.log('[ANALYTICS] Falling back to cached analytics from database');
        const normalizedData = normalizeAnalytics(post.analytics, postId);
        return sendSuccess(res, normalizedData);
      }

      // Handle specific error cases
      if (statusCode === 404) {
        return sendError(
          res,
          "Post not found or analytics not yet available",
          ErrorCodes.NOT_FOUND,
          {
            message: "Analytics for this post are not available yet. It may take 24-48 hours for analytics to become available after posting."
          }
        );
      }

      if (statusCode === 400) {
        return sendError(
          res,
          "Invalid post ID or analytics not supported for this platform",
          ErrorCodes.VALIDATION_ERROR,
          {
            message: "Analytics may not be available for this post or platform."
          }
        );
      }

      // Generic error
      return sendError(
        res,
        "Failed to fetch analytics from Ayrshare",
        ErrorCodes.EXTERNAL_API_ERROR,
        {
          statusCode,
          message: responseData?.message || ayrshareError.message
        }
      );
    }

  } catch (error) {
    logError('analytics.handler', error);
    return sendError(
      res,
      "Failed to fetch analytics",
      ErrorCodes.INTERNAL_ERROR,
      error.message
    );
  }
};

/**
 * Normalize analytics data from Ayrshare into a consistent format
 * Handles different response structures and metric names across platforms
 */
function normalizeAnalytics(data, postId) {
  // Ayrshare returns platforms as top-level keys (instagram, tiktok, etc.)
  // Each platform has an "analytics" object inside it

  // Initialize aggregated totals
  const aggregated = {
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    reach: 0,
    clicks: 0,
    engagementRate: 0,
    totalEngagements: 0
  };

  // Platform-specific analytics
  const byPlatform = {};

  // List of possible social media platform keys
  const platformKeys = ['instagram', 'tiktok', 'facebook', 'twitter', 'x', 'linkedin', 'youtube', 'pinterest'];

  // Iterate through each platform in the response
  Object.keys(data).forEach(key => {
    const lowerKey = key.toLowerCase();

    // Skip non-platform keys (id, status, etc.)
    if (!platformKeys.includes(lowerKey)) {
      return;
    }

    const platformData = data[key];

    // Extract analytics from platform data
    // Ayrshare format: { instagram: { analytics: {...}, id: "...", postUrl: "..." } }
    const analyticsData = platformData.analytics || platformData;

    if (!analyticsData || typeof analyticsData !== 'object') {
      return;
    }

    const normalized = normalizePlatformMetrics(analyticsData, lowerKey);
    byPlatform[lowerKey] = normalized;

    // Aggregate totals
    aggregated.views += normalized.views || 0;
    aggregated.likes += normalized.likes || 0;
    aggregated.comments += normalized.comments || 0;
    aggregated.shares += normalized.shares || 0;
    aggregated.reach += normalized.reach || 0;
    aggregated.clicks += normalized.clicks || 0;
    aggregated.totalEngagements += normalized.totalEngagements || 0;
  });

  // Calculate overall engagement rate
  if (aggregated.views > 0) {
    aggregated.engagementRate = parseFloat(
      ((aggregated.totalEngagements / aggregated.views) * 100).toFixed(2)
    );
  }

  return {
    postId,
    aggregated,
    byPlatform,
    platformCount: Object.keys(byPlatform).length,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Normalize metrics for a specific platform
 * Different platforms use different metric names
 */
function normalizePlatformMetrics(data, platform) {
  const normalized = {
    platform,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    reach: null,
    clicks: null,
    engagementRate: null,
    totalEngagements: 0,
    rawData: data // Keep raw data for debugging
  };

  // Helper: safely extract reactions count (may be an object like {like: 1, love: 2} or a number)
  const getReactionsCount = (reactions) => {
    if (typeof reactions === 'number') return reactions;
    if (reactions && typeof reactions === 'object') {
      return Object.values(reactions).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
    }
    return 0;
  };

  // Platform-specific metric mapping
  // Ayrshare uses camelCase: likeCount, commentsCount, viewsCount, etc.
  switch (platform) {
    case 'facebook':
      normalized.views = data.impressions || data.views || data.viewsCount || 0;
      normalized.likes = data.likeCount || data.likes || getReactionsCount(data.reactions) || 0;
      normalized.comments = data.commentsCount || data.comments || 0;
      normalized.shares = data.sharesCount || data.shares || 0;
      normalized.reach = data.reachCount || data.reach || null;
      normalized.clicks = data.clicks || data.link_clicks || null;
      break;

    case 'instagram':
      normalized.views = data.viewsCount || data.impressions || data.reach || 0;
      normalized.likes = data.likeCount || data.likes || 0;
      normalized.comments = data.commentsCount || data.comments || 0;
      normalized.shares = data.sharesCount || data.shares || 0;
      normalized.reach = data.reachCount || data.reach || null;
      normalized.clicks = data.profile_visits || null;
      break;

    case 'twitter':
    case 'x':
    case 'x/twitter':
      normalized.views = data.impressions || data.views || data.viewsCount || 0;
      normalized.likes = data.likeCount || data.likes || data.favorites || 0;
      normalized.comments = data.commentsCount || data.replies || data.comments || 0;
      normalized.shares = data.retweetsCount || data.retweets || 0;
      normalized.reach = data.impressions || null;
      normalized.clicks = data.url_clicks || data.clicks || null;
      break;

    case 'linkedin': {
      // LinkedIn analytics from Ayrshare may come back as:
      // { "(urn:li:activity:123...)": { totalShareStatistics: { likeCount, commentCount, ... } } }
      // Detect this shape and unwrap it before reading metrics.
      const linkedinKeys = Object.keys(data);
      let ld = data; // default: flat object
      if (linkedinKeys.length > 0 && linkedinKeys[0].toLowerCase().includes('urn:li:')) {
        const firstActivity = data[linkedinKeys[0]];
        ld = firstActivity.totalShareStatistics || firstActivity.analytics || firstActivity || {};
      }
      normalized.views    = ld.impressionCount || ld.impressions || ld.views || ld.viewsCount || 0;
      normalized.likes    = ld.likeCount    || ld.likes    || getReactionsCount(ld.reactions) || 0;
      normalized.comments = ld.commentCount || ld.commentsCount || ld.comments || 0;
      normalized.shares   = ld.shareCount   || ld.sharesCount   || ld.shares  || 0;
      normalized.reach    = ld.impressionCount || ld.impressions || null;
      normalized.clicks   = ld.clickCount   || ld.clicks   || null;
      break;
    }

    case 'tiktok':
      normalized.views = data.videoViews || data.views || data.viewsCount || 0;
      normalized.likes = data.likeCount || data.likes || 0;
      normalized.comments = data.commentsCount || data.comments || 0;
      normalized.shares = data.shareCount || data.shares || 0;
      normalized.reach = data.reach || data.videoViews || null;
      normalized.clicks = null; // Not available
      break;

    case 'youtube':
      normalized.views = data.viewsCount || data.views || 0;
      normalized.likes = data.likeCount || data.likes || 0;
      normalized.comments = data.commentsCount || data.comments || 0;
      normalized.shares = data.sharesCount || data.shares || 0;
      normalized.reach = data.views || null;
      normalized.clicks = null;
      break;

    default:
      // Generic fallback - try both camelCase and regular naming
      normalized.views = data.viewsCount || data.videoViews || data.impressions || data.views || 0;
      normalized.likes = data.likeCount || data.likes || 0;
      normalized.comments = data.commentsCount || data.comments || 0;
      normalized.shares = data.sharesCount || data.shareCount || data.shares || 0;
      normalized.reach = data.reachCount || data.reach || null;
      normalized.clicks = data.clicks || null;
  }

  // Ensure all numeric fields are actual numbers (guards against URN strings
  // leaking in from unexpected Ayrshare response shapes)
  ['views', 'likes', 'comments', 'shares', 'clicks', 'reach'].forEach(field => {
    const v = normalized[field];
    if (v !== null && typeof v !== 'number') {
      normalized[field] = typeof v === 'string' ? (parseFloat(v) || 0) : 0;
    }
  });

  // Calculate total engagements
  normalized.totalEngagements =
    (normalized.likes || 0) +
    (normalized.comments || 0) +
    (normalized.shares || 0);

  // Calculate engagement rate if we have views
  if (normalized.views > 0) {
    normalized.engagementRate = parseFloat(
      ((normalized.totalEngagements / normalized.views) * 100).toFixed(2)
    );
  }

  return normalized;
}

/**
 * Format number for display (e.g., 1234 -> 1.2K)
 */
function formatNumber(num) {
  if (num === null || num === undefined) return null;
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
