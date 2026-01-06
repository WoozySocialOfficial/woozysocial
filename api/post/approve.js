const { setCors, getSupabase, parseBody } = require("../_utils");

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

      const validActions = ['approve', 'reject'];
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
        'reject': 'rejected'
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

      res.status(200).json({
        success: true,
        status: newStatus,
        message: `Post ${action === 'approve' ? 'approved' : 'rejected'}`
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
