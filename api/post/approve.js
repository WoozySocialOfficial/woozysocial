const axios = require("axios");
const { setCors, getSupabase, parseBody, getWorkspaceProfileKey } = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

// Helper to send post to Ayrshare
async function sendToAyrshare(post, profileKey) {
  const postData = {
    post: post.caption,
    platforms: post.platforms
  };

  // Check if scheduled time is in the future
  if (post.scheduled_at) {
    const scheduledTime = new Date(post.scheduled_at);
    const now = new Date();

    if (scheduledTime > now) {
      // Schedule for future
      postData.scheduleDate = Math.floor(scheduledTime.getTime() / 1000);
    }
    // If scheduled time has passed, post immediately (no scheduleDate)
  }

  if (post.media_urls && post.media_urls.length > 0) {
    postData.mediaUrls = post.media_urls;
  }

  const response = await axios.post(`${BASE_AYRSHARE}/post`, postData, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      "Profile-Key": profileKey
    }
  });

  return response.data;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Database not configured" });
  }

  // POST - Approve, reject, or request changes
  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { postId, workspaceId, userId, action, comment } = body;

      if (!postId || !workspaceId || !userId || !action) {
        return res.status(400).json({
          error: "postId, workspaceId, userId, and action are required"
        });
      }

      const validActions = ['approve', 'reject', 'changes_requested'];
      if (!validActions.includes(action)) {
        return res.status(400).json({
          error: `Invalid action. Must be one of: ${validActions.join(', ')}`
        });
      }

      // Verify user is a member of the workspace
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        return res.status(403).json({ error: "You are not a member of this workspace" });
      }

      // Map action to status
      const statusMap = {
        'approve': 'approved',
        'reject': 'rejected',
        'changes_requested': 'changes_requested'
      };
      const newStatus = statusMap[action];

      // Update or create post approval record
      const { data: existingApproval } = await supabase
        .from('post_approvals')
        .select('id')
        .eq('post_id', postId)
        .single();

      const approvalData = {
        approval_status: newStatus,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (existingApproval) {
        await supabase
          .from('post_approvals')
          .update(approvalData)
          .eq('id', existingApproval.id);
      } else {
        await supabase
          .from('post_approvals')
          .insert({
            post_id: postId,
            workspace_id: workspaceId,
            ...approvalData
          });
      }

      // Update the post's approval_status
      await supabase
        .from('posts')
        .update({ approval_status: newStatus })
        .eq('id', postId);

      // If approved, send the post to Ayrshare
      if (action === 'approve') {
        // Get the post data
        const { data: post } = await supabase
          .from('posts')
          .select('*')
          .eq('id', postId)
          .single();

        if (post && post.status === 'pending_approval') {
          // Get workspace profile key
          const profileKey = await getWorkspaceProfileKey(workspaceId);

          if (profileKey) {
            try {
              const ayrshareResponse = await sendToAyrshare(post, profileKey);

              if (ayrshareResponse.status !== 'error') {
                // Update post with Ayrshare ID and new status
                const ayrPostId = ayrshareResponse.id || ayrshareResponse.postId;
                const scheduledTime = new Date(post.scheduled_at);
                const now = new Date();
                const isStillFuture = scheduledTime > now;

                await supabase
                  .from('posts')
                  .update({
                    ayr_post_id: ayrPostId,
                    status: isStillFuture ? 'scheduled' : 'posted',
                    posted_at: isStillFuture ? null : new Date().toISOString()
                  })
                  .eq('id', postId);
              } else {
                // Ayrshare returned error
                await supabase
                  .from('posts')
                  .update({
                    status: 'failed',
                    last_error: ayrshareResponse.message || 'Failed to post to Ayrshare'
                  })
                  .eq('id', postId);

                return res.status(400).json({
                  success: false,
                  error: 'Failed to post to social platforms',
                  details: ayrshareResponse
                });
              }
            } catch (ayrError) {
              // Failed to send to Ayrshare
              await supabase
                .from('posts')
                .update({
                  status: 'failed',
                  last_error: ayrError.response?.data?.message || ayrError.message
                })
                .eq('id', postId);

              return res.status(500).json({
                success: false,
                error: 'Failed to send post to social platforms',
                details: ayrError.response?.data || ayrError.message
              });
            }
          } else {
            return res.status(400).json({
              success: false,
              error: 'No Ayrshare profile found for this workspace'
            });
          }
        }
      }

      // Add system comment if provided or create default one
      const systemComment = comment || `Post ${action === 'approve' ? 'approved' : 'rejected'}`;

      // Get user info for the comment
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', userId)
        .single();

      const userName = userProfile?.full_name || userProfile?.email || 'User';

      await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          workspace_id: workspaceId,
          user_id: userId,
          comment: `${userName}: ${systemComment}`,
          is_system: true
        });

      const actionMessages = {
        'approve': 'approved',
        'reject': 'rejected',
        'changes_requested': 'marked for changes'
      };
      res.status(200).json({
        success: true,
        status: newStatus,
        message: `Post ${actionMessages[action]}`
      });

    } catch (error) {
      console.error("Error updating approval:", error);
      res.status(500).json({ error: "Failed to update approval status" });
    }
  }

  // GET - Get approval status and comments for a post
  else if (req.method === "GET") {
    try {
      const { postId, workspaceId } = req.query;

      if (!postId) {
        return res.status(400).json({ error: "postId is required" });
      }

      // Get approval record
      const { data: approval } = await supabase
        .from('post_approvals')
        .select(`
          id,
          approval_status,
          reviewed_at,
          reviewed_by,
          user_profiles!reviewed_by (
            full_name,
            email
          )
        `)
        .eq('post_id', postId)
        .single();

      // Get comments
      const { data: comments } = await supabase
        .from('post_comments')
        .select(`
          id,
          comment,
          is_system,
          created_at,
          user_id,
          user_profiles (
            full_name,
            email,
            avatar_url
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      res.status(200).json({
        success: true,
        approval: approval || { approval_status: 'pending' },
        comments: comments || []
      });

    } catch (error) {
      console.error("Error fetching approval:", error);
      res.status(500).json({ error: "Failed to fetch approval status" });
    }
  }

  else {
    res.status(405).json({ error: "Method not allowed" });
  }
};
