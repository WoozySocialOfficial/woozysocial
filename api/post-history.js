const axios = require("axios");
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

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  try {
    const { userId, workspaceId } = req.query;

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

    let response;
    try {
      response = await axios.get(`${BASE_AYRSHARE}/history`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        },
        timeout: 30000
      });
    } catch (axiosError) {
      logError('post-history.ayrshare', axiosError);
      return sendError(
        res,
        "Failed to fetch post history from social media service",
        ErrorCodes.EXTERNAL_API_ERROR
      );
    }

    // Get approval data from Supabase if workspaceId is provided
    let approvalData = {};
    let commentsData = {};

    if (workspaceId) {
      const supabase = getSupabase();
      if (supabase) {
        // Fetch post approvals
        const { data: approvals, error: approvalError } = await supabase
          .from('post_approvals')
          .select('post_id, approval_status, reviewed_by, reviewed_at')
          .eq('workspace_id', workspaceId);

        if (approvalError) {
          logError('post-history.getApprovals', approvalError, { workspaceId });
        }

        if (approvals) {
          approvals.forEach(a => {
            approvalData[a.post_id] = a;
          });
        }

        // Fetch post comments with user info
        const { data: comments, error: commentsError } = await supabase
          .from('post_comments')
          .select(`
            id,
            post_id,
            comment,
            is_system,
            created_at,
            user_id,
            user_profiles:user_id (full_name)
          `)
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: true });

        if (commentsError) {
          logError('post-history.getComments', commentsError, { workspaceId });
        }

        if (comments) {
          comments.forEach(c => {
            if (!commentsData[c.post_id]) {
              commentsData[c.post_id] = [];
            }
            commentsData[c.post_id].push({
              id: c.id,
              comment: c.comment,
              is_system: c.is_system,
              created_at: c.created_at,
              user_id: c.user_id,
              user_name: c.user_profiles?.full_name || 'Unknown'
            });
          });
        }
      }
    }

    // Merge approval and comment data with history
    const history = response.data.history || [];
    const enrichedHistory = history.map(post => ({
      ...post,
      approval_status: approvalData[post.id]?.approval_status || 'pending',
      requires_approval: true,
      comments: commentsData[post.id] || []
    }));

    return sendSuccess(res, {
      ...response.data,
      history: enrichedHistory
    });

  } catch (error) {
    logError('post-history.handler', error);
    return sendError(res, "Failed to fetch post history", ErrorCodes.INTERNAL_ERROR);
  }
};
