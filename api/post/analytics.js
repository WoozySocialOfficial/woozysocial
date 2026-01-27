const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
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

    // Fetch analytics from Ayrshare
    try {
      const response = await axios.get(
        `${BASE_AYRSHARE}/analytics/post`,
        {
          params: { id: postId },
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
  // Ayrshare can return analytics in different formats
  // Handle both direct analytics and array of platform analytics
  const platformAnalytics = data.analytics || data.platforms || [];

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

  // If analytics is an array (multiple platforms)
  if (Array.isArray(platformAnalytics)) {
    platformAnalytics.forEach(platformData => {
      const platform = (platformData.platform || '').toLowerCase();
      if (!platform) return;

      const normalized = normalizePlatformMetrics(platformData, platform);
      byPlatform[platform] = normalized;

      // Aggregate totals
      aggregated.views += normalized.views || 0;
      aggregated.likes += normalized.likes || 0;
      aggregated.comments += normalized.comments || 0;
      aggregated.shares += normalized.shares || 0;
      aggregated.reach += normalized.reach || 0;
      aggregated.clicks += normalized.clicks || 0;
      aggregated.totalEngagements += normalized.totalEngagements || 0;
    });
  } else if (typeof platformAnalytics === 'object') {
    // Single platform or object format
    Object.keys(platformAnalytics).forEach(platform => {
      const platformData = platformAnalytics[platform];
      const normalized = normalizePlatformMetrics(platformData, platform.toLowerCase());
      byPlatform[platform.toLowerCase()] = normalized;

      // Aggregate totals
      aggregated.views += normalized.views || 0;
      aggregated.likes += normalized.likes || 0;
      aggregated.comments += normalized.comments || 0;
      aggregated.shares += normalized.shares || 0;
      aggregated.reach += normalized.reach || 0;
      aggregated.clicks += normalized.clicks || 0;
      aggregated.totalEngagements += normalized.totalEngagements || 0;
    });
  }

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

  // Platform-specific metric mapping
  switch (platform) {
    case 'facebook':
      normalized.views = data.impressions || data.views || 0;
      normalized.likes = data.likes || data.reactions || 0;
      normalized.comments = data.comments || 0;
      normalized.shares = data.shares || 0;
      normalized.reach = data.reach || null;
      normalized.clicks = data.clicks || data.link_clicks || null;
      break;

    case 'instagram':
      normalized.views = data.impressions || data.reach || 0;
      normalized.likes = data.likes || 0;
      normalized.comments = data.comments || 0;
      normalized.shares = null; // Instagram doesn't have shares metric
      normalized.reach = data.reach || null;
      normalized.clicks = data.profile_visits || null;
      break;

    case 'twitter':
    case 'x':
    case 'x/twitter':
      normalized.views = data.impressions || data.views || 0;
      normalized.likes = data.likes || data.favorites || 0;
      normalized.comments = data.replies || data.comments || 0;
      normalized.shares = data.retweets || 0;
      normalized.reach = data.impressions || null; // Twitter uses impressions as reach
      normalized.clicks = data.url_clicks || data.clicks || null;
      break;

    case 'linkedin':
      normalized.views = data.impressions || data.views || 0;
      normalized.likes = data.likes || data.reactions || 0;
      normalized.comments = data.comments || 0;
      normalized.shares = data.shares || 0;
      normalized.reach = data.impressions || null;
      normalized.clicks = data.clicks || null;
      break;

    case 'tiktok':
      normalized.views = data.views || data.video_views || 0;
      normalized.likes = data.likes || 0;
      normalized.comments = data.comments || 0;
      normalized.shares = data.shares || 0;
      normalized.reach = data.views || null; // TikTok views = reach
      normalized.clicks = null; // Not available
      break;

    case 'youtube':
      normalized.views = data.views || 0;
      normalized.likes = data.likes || 0;
      normalized.comments = data.comments || 0;
      normalized.shares = data.shares || 0;
      normalized.reach = data.views || null;
      normalized.clicks = null;
      break;

    default:
      // Generic fallback
      normalized.views = data.impressions || data.views || 0;
      normalized.likes = data.likes || 0;
      normalized.comments = data.comments || 0;
      normalized.shares = data.shares || 0;
      normalized.reach = data.reach || null;
      normalized.clicks = data.clicks || null;
  }

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
