const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../_utils");

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
      logError('post.pending-approvals.checkMembership', membershipError, { userId, workspaceId });
    }

    if (!membership) {
      return sendError(res, "You are not a member of this workspace", ErrorCodes.FORBIDDEN);
    }

    // Build query for posts
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
        user_profiles!user_id (
          full_name,
          email,
          avatar_url
        ),
        post_approvals (
          approval_status,
          reviewed_at,
          reviewed_by
        ),
        post_comments (
          id
        )
      `)
      .eq('workspace_id', workspaceId)
      .order('scheduled_at', { ascending: true });

    // Filter by approval status if provided
    if (status) {
      query = query.eq('approval_status', status);
    } else {
      // Default to showing posts that need action (pending or changes_requested)
      query = query.in('approval_status', ['pending', 'changes_requested']);
    }

    // Show posts that are pending approval or scheduled
    query = query.in('status', ['pending_approval', 'scheduled']);

    const { data: posts, error } = await query;

    if (error) {
      logError('post.pending-approvals.fetch', error, { workspaceId });
      return sendError(res, "Failed to fetch pending approvals", ErrorCodes.DATABASE_ERROR);
    }

    // Add comment count and map fields for frontend
    const postsWithMeta = (posts || []).map(post => ({
      ...post,
      // Map to frontend expected field names
      post: post.caption,
      schedule_date: post.scheduled_at,
      media_url: post.media_urls?.[0] || null,
      commentCount: post.post_comments?.length || 0,
      post_comments: undefined // Remove the array, just keep count
    }));

    // Group by approval status for UI convenience
    const grouped = {
      pending: postsWithMeta.filter(p => p.approval_status === 'pending'),
      changes_requested: postsWithMeta.filter(p => p.approval_status === 'changes_requested'),
      approved: postsWithMeta.filter(p => p.approval_status === 'approved'),
      rejected: postsWithMeta.filter(p => p.approval_status === 'rejected')
    };

    return sendSuccess(res, {
      posts: postsWithMeta,
      grouped: grouped,
      counts: {
        pending: grouped.pending.length,
        changes_requested: grouped.changes_requested.length,
        approved: grouped.approved.length,
        rejected: grouped.rejected.length,
        total: postsWithMeta.length
      },
      userRole: membership.role
    });

  } catch (error) {
    logError('post.pending-approvals.handler', error);
    return sendError(res, "Failed to fetch pending approvals", ErrorCodes.INTERNAL_ERROR);
  }
};
