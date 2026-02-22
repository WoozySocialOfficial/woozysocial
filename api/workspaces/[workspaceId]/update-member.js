const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../../_utils");
const { sendRoleChangedNotification, sendPermissionChangedNotification } = require("../../notifications/helpers");

const VALID_ROLES = ['member', 'viewer'];

const ROLE_PERMISSIONS = {
  owner: {
    can_manage_team: true,
    can_manage_settings: true,
    can_delete_posts: true,
    can_final_approval: true,
    can_approve_posts: true
  },
  member: {
    can_manage_team: false,
    can_manage_settings: false,
    can_delete_posts: true,
    can_final_approval: false,
    can_approve_posts: false
  },
  viewer: {
    can_manage_team: false,
    can_manage_settings: false,
    can_delete_posts: false,
    can_final_approval: false,
    can_approve_posts: false
  }
};

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();

  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { workspaceId } = req.query;
    const { memberId, userId, role, permissions } = req.body;

    if (!memberId || !userId || !workspaceId) {
      return sendError(res, "memberId, userId, and workspaceId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId) || !isValidUUID(userId) || !isValidUUID(memberId)) {
      return sendError(res, "Invalid UUID format", ErrorCodes.VALIDATION_ERROR);
    }

    if (role && !VALID_ROLES.includes(role)) {
      return sendError(res, `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, ErrorCodes.VALIDATION_ERROR);
    }

    // Run both permission checks in parallel
    const [membershipResult, targetResult] = await Promise.all([
      supabase
        .from('workspace_members')
        .select('role, can_manage_team')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single(),
      supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', memberId)
        .single()
    ]);

    const { data: membership, error: membershipError } = membershipResult;
    const { data: targetMember, error: targetError } = targetResult;

    if (membershipError && membershipError.code !== 'PGRST116') {
      logError('workspaces.update-member.checkMembership', membershipError, { userId, workspaceId });
    }

    if (!membership) {
      return sendError(res, "You don't have access to this workspace", ErrorCodes.FORBIDDEN);
    }

    const canManageTeam = membership.role === 'owner' || membership.can_manage_team === true;
    if (!canManageTeam) {
      return sendError(res, "You don't have permission to manage team members", ErrorCodes.FORBIDDEN);
    }

    if (targetError && targetError.code !== 'PGRST116') {
      logError('workspaces.update-member.getTarget', targetError, { memberId, workspaceId });
    }

    if (!targetMember) {
      return sendError(res, "Member not found in this workspace", ErrorCodes.NOT_FOUND);
    }

    if (targetMember.role === 'owner') {
      return sendError(res, "Cannot modify the workspace owner's role", ErrorCodes.VALIDATION_ERROR);
    }

    // Build update object
    const updateData = {};

    if (role) {
      updateData.role = role;
      const rolePerms = ROLE_PERMISSIONS[role];
      if (rolePerms) {
        Object.assign(updateData, rolePerms);
      }
    }

    if (permissions && typeof permissions === 'object') {
      const permMap = {
        canManageTeam: 'can_manage_team',
        canManageSettings: 'can_manage_settings',
        canDeletePosts: 'can_delete_posts',
        canFinalApproval: 'can_final_approval',
        canApprovePosts: 'can_approve_posts'
      };

      for (const [camel, snake] of Object.entries(permMap)) {
        if (camel in permissions) {
          updateData[snake] = Boolean(permissions[camel]);
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return sendError(res, "No updates provided", ErrorCodes.VALIDATION_ERROR);
    }

    // Perform update
    const { error: updateError } = await supabase
      .from('workspace_members')
      .update(updateData)
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId);

    if (updateError) {
      logError('workspaces.update-member.update', updateError, { memberId, workspaceId });
      return sendError(res, "Failed to update member", ErrorCodes.DATABASE_ERROR);
    }

    // Send notifications for role/permission changes (non-blocking)
    const permSnakeMap = {
      canFinalApproval: 'can_final_approval',
      canApprovePosts: 'can_approve_posts',
      canManageTeam: 'can_manage_team',
    };
    const permToNotify = permissions ? Object.keys(permissions).filter(k => k in permSnakeMap) : [];
    const roleChanged = role && role !== targetMember.role;

    if (roleChanged || permToNotify.length > 0) {
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .single();
      const workspaceName = workspace?.name || 'Unknown';

      if (roleChanged) {
        await sendRoleChangedNotification(supabase, {
          userId: memberId,
          workspaceId,
          workspaceName,
          oldRole: targetMember.role,
          newRole: role,
          changedByUserId: userId
        });
      }

      if (permToNotify.length > 0) {
        await Promise.all(permToNotify.map(k =>
          sendPermissionChangedNotification(supabase, {
            userId: memberId,
            workspaceId,
            workspaceName,
            permissionName: permSnakeMap[k],
            granted: Boolean(permissions[k]),
            changedByUserId: userId
          })
        ));
      }
    }

    return sendSuccess(res, {
      message: "Member updated successfully",
      updates: updateData
    });

  } catch (error) {
    logError('workspaces.update-member.handler', error);
    return sendError(res, "Internal error", ErrorCodes.INTERNAL_ERROR);
  }
};
