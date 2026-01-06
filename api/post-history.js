const axios = require("axios");
const { setCors, getWorkspaceProfileKeyForUser, getSupabase } = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userId, workspaceId } = req.query;

    // Get profile key using workspace context (handles team inheritance)
    const profileKey = await getWorkspaceProfileKeyForUser(userId);

    const response = await axios.get(`${BASE_AYRSHARE}/history`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    // Get approval data from Supabase if workspaceId is provided
    let approvalData = {};
    let commentsData = {};

    if (workspaceId) {
      const supabase = getSupabase();
      if (supabase) {
        // Fetch post approvals
        const { data: approvals } = await supabase
          .from('post_approvals')
          .select('post_id, approval_status, reviewed_by, reviewed_at')
          .eq('workspace_id', workspaceId);

        if (approvals) {
          approvals.forEach(a => {
            approvalData[a.post_id] = a;
          });
        }

        // Fetch post comments with user info
        const { data: comments } = await supabase
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

    res.status(response.status).json({
      ...response.data,
      history: enrichedHistory
    });
  } catch (error) {
    console.error("Error fetching post history:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch post history" });
  }
};
