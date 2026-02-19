const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../../_utils");
const { sendRoleChangedNotification } = require("../../notifications/helpers");

const { normalizeRole } = require("../../_utils-access-control");

// VERSION TRACKING
const VERSION = "3.0.0-BULLETPROOF-FEB19";

const VALID_ROLES = ['member', 'viewer'];

// Role-based permission defaults
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

    // EXPLICIT VERSION LOGGING
    console.log('═══════════════════════════════════════════════');
    console.log(`[update-member] VERSION: ${VERSION}`);
    console.log('[update-member] TIMESTAMP:', new Date().toISOString());
    console.log('═══════════════════════════════════════════════');
    console.log('[update-member] RAW REQUEST BODY:', JSON.stringify(req.body, null, 2));
    console.log('[update-member] workspaceId:', workspaceId);
    console.log('[update-member] memberId:', memberId);
    console.log('[update-member] userId:', userId);
    console.log('[update-member] role:', role);
    console.log('[update-member] permissions:', JSON.stringify(permissions, null, 2));
    console.log('[update-member] permissions type:', typeof permissions);
    console.log('[update-member] permissions is null?', permissions === null);
    console.log('[update-member] permissions is undefined?', permissions === undefined);
    if (permissions) {
      console.log('[update-member] permissions keys:', Object.keys(permissions));
      console.log('[update-member] permissions values:', Object.values(permissions));
    }

    if (!memberId || !userId || !workspaceId) {
      console.log('[update-member] ERROR: Missing required fields');
      return sendError(res, "memberId, userId, and workspaceId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      console.log('[update-member] ERROR: Invalid workspaceId UUID');
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId)) {
      console.log('[update-member] ERROR: Invalid userId UUID');
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(memberId)) {
      console.log('[update-member] ERROR: Invalid memberId UUID');
      return sendError(res, "Invalid memberId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate role if provided
    if (role && !VALID_ROLES.includes(role)) {
      console.log('[update-member] ERROR: Invalid role:', role);
      return sendError(
        res,
        `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Check if user has permission to update members
    console.log('[update-member] Checking permissions of user', userId);
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role, can_manage_team')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      console.log('[update-member] ERROR querying membership:', membershipError);
      logError('workspaces.update-member.checkMembership', membershipError, { userId, workspaceId });
    }

    if (!membership) {
      console.log('[update-member] ERROR: User not a member of workspace');
      return sendError(res, "You don't have access to this workspace", ErrorCodes.FORBIDDEN);
    }

    console.log('[update-member] User membership:', JSON.stringify(membership));

    const canManageTeam = membership.role === 'owner' || membership.can_manage_team === true;
    console.log('[update-member] Can manage team?', canManageTeam);

    if (!canManageTeam) {
      console.log('[update-member] ERROR: User lacks permission to manage team');
      return sendError(res, "You don't have permission to manage team members", ErrorCodes.FORBIDDEN);
    }

    // Get target member
    console.log('[update-member] Fetching target member:', memberId);
    const { data: targetMember, error: targetError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId)
      .single();

    if (targetError && targetError.code !== 'PGRST116') {
      console.log('[update-member] ERROR querying target member:', targetError);
      logError('workspaces.update-member.getTarget', targetError, { memberId, workspaceId });
    }

    if (!targetMember) {
      console.log('[update-member] ERROR: Target member not found');
      return sendError(res, "Member not found in this workspace", ErrorCodes.NOT_FOUND);
    }

    console.log('[update-member] Target member:', JSON.stringify(targetMember));

    if (targetMember.role === 'owner') {
      console.log('[update-member] ERROR: Cannot modify owner');
      return sendError(res, "Cannot modify the workspace owner's role", ErrorCodes.VALIDATION_ERROR);
    }

    // ══════════════════════════════════════════════════
    // BUILD UPDATE OBJECT - BULLETPROOF VERSION
    // ══════════════════════════════════════════════════
    const updateData = {};
    console.log('[update-member] Building update object...');

    // Handle role change
    if (role) {
      console.log('[update-member] Role change requested:', role);
      updateData.role = role;
      const rolePerms = ROLE_PERMISSIONS[role];
      if (rolePerms) {
        updateData.can_manage_team = rolePerms.can_manage_team;
        updateData.can_manage_settings = rolePerms.can_manage_settings;
        updateData.can_delete_posts = rolePerms.can_delete_posts;
        updateData.can_final_approval = rolePerms.can_final_approval;
        updateData.can_approve_posts = rolePerms.can_approve_posts;
        console.log('[update-member] Applied role permissions:', JSON.stringify(rolePerms));
      }
    }

    // Handle permission overrides - SIMPLIFIED LOGIC
    if (permissions !== null && permissions !== undefined && typeof permissions === 'object') {
      console.log('[update-member] Processing permission overrides...');

      // Check each permission explicitly
      if ('canManageTeam' in permissions) {
        const value = Boolean(permissions.canManageTeam);
        updateData.can_manage_team = value;
        console.log('[update-member] ✓ Set can_manage_team =', value);
      }

      if ('canManageSettings' in permissions) {
        const value = Boolean(permissions.canManageSettings);
        updateData.can_manage_settings = value;
        console.log('[update-member] ✓ Set can_manage_settings =', value);
      }

      if ('canDeletePosts' in permissions) {
        const value = Boolean(permissions.canDeletePosts);
        updateData.can_delete_posts = value;
        console.log('[update-member] ✓ Set can_delete_posts =', value);
      }

      if ('canFinalApproval' in permissions) {
        const value = Boolean(permissions.canFinalApproval);
        updateData.can_final_approval = value;
        console.log('[update-member] ✓✓✓ Set can_final_approval =', value, '✓✓✓');
      }

      if ('canApprovePosts' in permissions) {
        const value = Boolean(permissions.canApprovePosts);
        updateData.can_approve_posts = value;
        console.log('[update-member] ✓ Set can_approve_posts =', value);
      }
    } else {
      console.log('[update-member] No permissions to process (null/undefined/not object)');
    }

    console.log('[update-member] ═══════════════════════════════════════');
    console.log('[update-member] FINAL UPDATE DATA:', JSON.stringify(updateData, null, 2));
    console.log('[update-member] Update data keys:', Object.keys(updateData));
    console.log('[update-member] Update data key count:', Object.keys(updateData).length);
    console.log('[update-member] ═══════════════════════════════════════');

    if (Object.keys(updateData).length === 0) {
      console.log('[update-member] ❌ ERROR: No updates provided');
      console.log('[update-member] role was:', role);
      console.log('[update-member] permissions was:', JSON.stringify(permissions));
      return sendError(
        res,
        `No updates provided. Check logs. Version: ${VERSION}. Role: ${role}, Permissions: ${JSON.stringify(permissions)}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Perform update
    console.log('[update-member] Executing database UPDATE...');
    const { error: updateError } = await supabase
      .from('workspace_members')
      .update(updateData)
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId);

    if (updateError) {
      console.log('[update-member] ❌ DATABASE UPDATE ERROR:', updateError);
      logError('workspaces.update-member.update', updateError, { memberId, workspaceId });
      return sendError(res, "Failed to update member", ErrorCodes.DATABASE_ERROR);
    }

    console.log('[update-member] ✓✓✓ DATABASE UPDATE SUCCESSFUL ✓✓✓');

    // Send notification if role changed
    if (role && role !== targetMember.role) {
      console.log('[update-member] Sending role change notification...');
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .single();

      await sendRoleChangedNotification(supabase, {
        userId: memberId,
        workspaceId,
        workspaceName: workspace?.name || 'Unknown',
        oldRole: targetMember.role,
        newRole: role,
        changedByUserId: userId
      });
      console.log('[update-member] Notification sent');
    }

    console.log('[update-member] ═══════════════════════════════════════');
    console.log('[update-member] SUCCESS - Member updated');
    console.log('[update-member] ═══════════════════════════════════════');

    return sendSuccess(res, {
      message: "Member updated successfully",
      updates: updateData
    });

  } catch (error) {
    console.log('[update-member] ❌❌❌ EXCEPTION CAUGHT ❌❌❌');
    console.log('[update-member] Error:', error);
    console.log('[update-member] Error stack:', error.stack);
    logError('workspaces.update-member.handler', error);
    return sendError(res, `Internal error. Version: ${VERSION}`, ErrorCodes.INTERNAL_ERROR);
  }
};
