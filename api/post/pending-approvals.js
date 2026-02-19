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

    // Verify user is a member of the workspace and fetch all permissions
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role, can_final_approval, can_approve_posts')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      logError('post.pending-approvals.checkMembership', membershipError, { userId, workspaceId });
    }

    if (!membership) {
      return sendError(res, "You are not a member of this workspace", ErrorCodes.FORBIDDEN);
    }

    // Build query for posts (removed invalid user_profiles join)
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
    if (status && status !== 'all') {
      query = query.eq('approval_status', status);
    } else if (!status) {
      // NEW: Default filter based on user permissions
      const hasFinalApproval = membership.can_final_approval === true || membership.role === 'owner';
      const isClientApprover = (
        membership.role === 'viewer' &&
        membership.can_approve_posts === true
      ) || membership.role === 'owner';

      if (hasFinalApproval && !isClientApprover) {
        // Pure final approver: see pending_internal and changes_requested
        query = query.in('approval_status', ['pending_internal', 'changes_requested']);
      } else if (isClientApprover && !hasFinalApproval) {
        // Pure client approver: see pending_client, pending, changes_requested
        query = query.in('approval_status', ['pending_client', 'pending', 'changes_requested']);
      } else if (hasFinalApproval && isClientApprover) {
        // Both: see everything except final states
        query = query.in('approval_status', [
          'pending_internal',
          'pending_client',
          'pending',
          'changes_requested'
        ]);
      } else {
        // Regular team member: see nothing in default view (they just create posts)
        query = query.eq('approval_status', 'none');  // Returns empty
      }
    }
    // If status === 'all', don't filter by approval_status

    // Show posts that are pending approval, scheduled, or posted (to include approved posts)
    query = query.in('status', ['pending_approval', 'scheduled', 'posted']);

    const { data: posts, error } = await query;

    if (error) {
      logError('post.pending-approvals.fetch', error, { workspaceId });
      return sendError(res, "Failed to fetch pending approvals", ErrorCodes.DATABASE_ERROR);
    }

    // Fetch creator info for all posts
    const creatorIds = [...new Set((posts || []).map(p => p.created_by || p.user_id).filter(Boolean))];
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

    // Add comment count, creator info, and map fields for frontend
    const postsWithMeta = (posts || []).map(post => {
      const creatorId = post.created_by || post.user_id;
      const creator = creatorProfiles[creatorId] || null;
      // Extract reviewed_at from post_approvals join
      // PostgREST may return a single object (if unique constraint) or an array
      const approvals = post.post_approvals
        ? (Array.isArray(post.post_approvals) ? post.post_approvals : [post.post_approvals])
        : [];
      const latestApproval = approvals.sort((a, b) =>
        new Date(b.reviewed_at || 0) - new Date(a.reviewed_at || 0)
      )[0];
      return {
        ...post,
        // Map to frontend expected field names
        post: post.caption,
        schedule_date: post.scheduled_at,
        media_url: post.media_urls?.[0] || null,
        reviewed_at: latestApproval?.reviewed_at || null,
        commentCount: post.post_comments?.length || 0,
        post_comments: undefined, // Remove the array, just keep count
        // Add creator info
        user_profiles: creator,
        creator_name: creator?.full_name || creator?.email || 'Unknown'
      };
    });

    // Group by approval status for UI convenience
    const grouped = {
      pending_internal: postsWithMeta.filter(p => p.approval_status === 'pending_internal'),
      pending_client: postsWithMeta.filter(p => p.approval_status === 'pending_client'),
      pending: postsWithMeta.filter(p => p.approval_status === 'pending'),
      changes_requested: postsWithMeta.filter(p => p.approval_status === 'changes_requested'),
      approved: postsWithMeta.filter(p => p.approval_status === 'approved'),
      rejected: postsWithMeta.filter(p => p.approval_status === 'rejected')
    };

    return sendSuccess(res, {
      posts: postsWithMeta,
      grouped: grouped,
      counts: {
        pending_internal: grouped.pending_internal.length,
        pending_client: grouped.pending_client.length,
        pending: grouped.pending.length,
        changes_requested: grouped.changes_requested.length,
        approved: grouped.approved.length,
        rejected: grouped.rejected.length,
        total: postsWithMeta.length
      },
      userRole: membership.role,
      hasFinalApproval: membership.can_final_approval === true || membership.role === 'owner',
      isClientApprover: (
        (membership.role === 'viewer' && membership.can_approve_posts === true) ||
        membership.role === 'owner'
      )
    });

  } catch (error) {
    logError('post.pending-approvals.handler', error);
    return sendError(res, "Failed to fetch pending approvals", ErrorCodes.INTERNAL_ERROR);
  }
};
