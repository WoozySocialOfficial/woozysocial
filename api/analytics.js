const axios = require("axios");
const {
  getSupabase,
  getWorkspaceProfileKey,
  setCors,
  sendSuccess,
  sendError,
  ErrorCodes,
} = require("./_utils");

const AYRSHARE_API = "https://api.ayrshare.com/api";

/**
 * Analytics API - Fetches engagement metrics and analytics data
 * GET /api/analytics?workspaceId={id}&period={7|30|90}&timezone={timezone}
 */
module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  try {
    const { workspaceId, period = "30", timezone = "UTC" } = req.query;

    if (!workspaceId) {
      return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
    }

    // Get workspace profile key for Ayrshare API
    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendSuccess(res, {
        summary: { totalPosts: 0, totalEngagements: 0, avgEngagement: 0 },
        platformStats: [],
        dailyStats: [],
        topPosts: [],
        engagementTrend: []
      });
    }

    const apiKey = process.env.AYRSHARE_API_KEY;
    if (!apiKey) {
      return sendError(res, "Ayrshare not configured", ErrorCodes.CONFIG_ERROR);
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Fetch posts from database with cached analytics
    const supabase = getSupabase();
    let posts = [];

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select('id, caption, content, platforms, posted_at, created_at, analytics, ayr_post_id')
          .eq('workspace_id', workspaceId)
          .eq('status', 'posted')
          .not('analytics', 'is', null)
          .gte('posted_at', startDate.toISOString())
          .order('posted_at', { ascending: false });

        if (error) {
          console.error('[ANALYTICS] Database error:', error);
        } else {
          console.log(`[ANALYTICS] Found ${data?.length || 0} posts with analytics`);
          // Transform database posts to match expected format
          posts = (data || []).map(post => ({
            id: post.ayr_post_id || post.id,
            post: post.caption || post.content || '',
            platforms: post.platforms || [],
            created: post.posted_at || post.created_at,
            publishDate: post.posted_at || post.created_at,
            analytics: post.analytics || {}
          }));
        }
      } catch (error) {
        console.error('[ANALYTICS] Error fetching posts from database:', error);
        posts = [];
      }
    }

    // Process posts into analytics data
    const analytics = processAnalytics(posts, parseInt(period), timezone);

    return sendSuccess(res, {
      ...analytics,
      timezone,
      dataSource: posts.length > 0 ? 'live' : 'no_data'
    });

  } catch (error) {
    console.error("Analytics API error:", error);
    return sendError(res, "Failed to fetch analytics", ErrorCodes.INTERNAL_ERROR);
  }
};

/**
 * Process raw posts into analytics metrics
 * @param {Array} posts - Raw posts from Ayrshare
 * @param {number} periodDays - Number of days to analyze
 * @param {string} timezone - User's timezone
 */
function processAnalytics(posts, periodDays, timezone = 'UTC') {
  // Filter posts within the period
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const filteredPosts = posts.filter(post => {
    const postDate = new Date(post.created || post.publishDate);
    return postDate >= periodStart;
  });

  // Platform breakdown
  const platformMap = {};
  const dailyMap = {};

  filteredPosts.forEach(post => {
    const platforms = post.platforms || [];
    const postDate = new Date(post.created || post.publishDate);
    const dayKey = postDate.toISOString().split('T')[0];

    // Initialize daily entry
    if (!dailyMap[dayKey]) {
      dailyMap[dayKey] = { date: dayKey, posts: 0, engagements: 0 };
    }
    dailyMap[dayKey].posts++;

    // Process each platform result
    platforms.forEach(platform => {
      const platformLower = platform.toLowerCase();

      if (!platformMap[platformLower]) {
        platformMap[platformLower] = {
          platform: platformLower,
          posts: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          impressions: 0,
          engagements: 0
        };
      }

      platformMap[platformLower].posts++;

      // Extract engagement from post analytics (Ayrshare format)
      // Ayrshare returns: { instagram: { analytics: { likeCount, commentsCount, ... } } }
      const platformData = post.analytics?.[platformLower] || post[platformLower] || {};
      const analytics = platformData.analytics || platformData;

      // Handle both camelCase (Ayrshare) and snake_case formats
      const likes = analytics.likeCount || analytics.likes || analytics.like_count || 0;
      const comments = analytics.commentsCount || analytics.comments || analytics.comment_count || 0;
      const shares = analytics.shareCount || analytics.sharesCount || analytics.shares || analytics.share_count || analytics.retweets || 0;
      const impressions = analytics.viewsCount || analytics.videoViews || analytics.impressions || analytics.views || 0;

      platformMap[platformLower].likes += likes;
      platformMap[platformLower].comments += comments;
      platformMap[platformLower].shares += shares;
      platformMap[platformLower].impressions += impressions;
      platformMap[platformLower].engagements += likes + comments + shares;

      dailyMap[dayKey].engagements += likes + comments + shares;
    });
  });

  // Convert to arrays and sort
  const platformStats = Object.values(platformMap).sort((a, b) => b.engagements - a.engagements);

  // Fill in missing days for daily stats
  const dailyStats = [];
  for (let i = periodDays - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayKey = date.toISOString().split('T')[0];
    dailyStats.push(dailyMap[dayKey] || { date: dayKey, posts: 0, engagements: 0 });
  }

  // Calculate totals
  const totalPosts = filteredPosts.length;
  const totalEngagements = platformStats.reduce((sum, p) => sum + p.engagements, 0);
  const totalImpressions = platformStats.reduce((sum, p) => sum + p.impressions, 0);
  const avgEngagement = totalPosts > 0 ? Math.round(totalEngagements / totalPosts * 10) / 10 : 0;

  // Get top performing posts
  const topPosts = filteredPosts
    .map(post => {
      let totalEng = 0;
      const platforms = post.platforms || [];
      platforms.forEach(platform => {
        const platformData = post.analytics?.[platform.toLowerCase()] || post[platform.toLowerCase()] || {};
        const analytics = platformData.analytics || platformData;

        const likes = analytics.likeCount || analytics.likes || 0;
        const comments = analytics.commentsCount || analytics.comments || 0;
        const shares = analytics.shareCount || analytics.sharesCount || analytics.shares || 0;

        totalEng += likes + comments + shares;
      });
      return {
        id: post.id,
        text: (post.post || '').substring(0, 100),
        platforms: post.platforms,
        engagements: totalEng,
        date: post.created || post.publishDate
      };
    })
    .sort((a, b) => b.engagements - a.engagements)
    .slice(0, 5);

  // Calculate engagement trend (compare to previous period)
  const midPoint = Math.floor(dailyStats.length / 2);
  const firstHalf = dailyStats.slice(0, midPoint);
  const secondHalf = dailyStats.slice(midPoint);

  const firstHalfEng = firstHalf.reduce((sum, d) => sum + d.engagements, 0);
  const secondHalfEng = secondHalf.reduce((sum, d) => sum + d.engagements, 0);
  const trendPercent = firstHalfEng > 0
    ? Math.round((secondHalfEng - firstHalfEng) / firstHalfEng * 100)
    : 0;

  return {
    summary: {
      totalPosts,
      totalEngagements,
      totalImpressions,
      avgEngagement,
      trendPercent
    },
    platformStats,
    dailyStats,
    topPosts
  };
}
