const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidUUID
} = require("../_utils");

/**
 * Delete Ayrshare profile for a workspace
 * @param {string} profileKey - The Ayrshare profile key to delete
 * @returns {Promise<boolean>} - True if deleted successfully, false otherwise
 */
async function deleteAyrshareProfile(profileKey) {
  if (!profileKey) {
    console.log('[WORKSPACE DELETE] No Ayrshare profile key to delete');
    return true; // Not an error - workspace just doesn't have an Ayrshare profile
  }

  const apiKey = process.env.AYRSHARE_API_KEY;
  if (!apiKey) {
    console.error('[WORKSPACE DELETE] AYRSHARE_API_KEY not configured, skipping profile deletion');
    return false;
  }

  try {
    const axios = require('axios');

    console.log(`[WORKSPACE DELETE] Deleting Ayrshare profile: ${profileKey}`);

    const response = await axios.delete('https://api.ayrshare.com/api/profiles', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Profile-Key': profileKey
      },
      timeout: 30000
    });

    console.log(`[WORKSPACE DELETE] Ayrshare profile deleted successfully:`, response.data);
    return true;
  } catch (error) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;

    console.error('[WORKSPACE DELETE] Failed to delete Ayrshare profile:', {
      profileKey,
      statusCode,
      error: errorData || error.message
    });

    logError('workspace.delete.ayrshare', error, { profileKey, statusCode });

    // Don't fail workspace deletion if Ayrshare deletion fails
    // User can manually delete from Ayrshare dashboard
    return false;
  }
}

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
    const { userId, workspaceId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['userId', 'workspaceId']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(userId) || !isValidUUID(workspaceId)) {
      return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
    }

    // Check if user is owner of this workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .limit(1);

    if (membershipError) {
      logError('workspace.delete.checkMembership', membershipError, { userId, workspaceId });
      return sendError(res, "Failed to verify permissions", ErrorCodes.DATABASE_ERROR);
    }

    if (!membership || membership.length === 0) {
      return sendError(res, "You do not have access to this workspace", ErrorCodes.FORBIDDEN);
    }

    if (membership[0].role !== 'owner') {
      return sendError(res, "Only the owner can delete the workspace", ErrorCodes.FORBIDDEN);
    }

    // Check how many workspaces the user owns
    const { data: userWorkspaces, error: countError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('role', 'owner');

    if (countError) {
      logError('workspace.delete.countWorkspaces', countError, { userId });
      return sendError(res, "Failed to verify workspace count", ErrorCodes.DATABASE_ERROR);
    }

    if (userWorkspaces && userWorkspaces.length <= 1) {
      return sendError(res, "Cannot delete your only workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Capture all member user IDs BEFORE deleting anything (CASCADE will remove them)
    const { data: allMembers } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);

    const memberUserIds = (allMembers || []).map(m => m.user_id);

    // Capture which users had this as their active workspace so we can redirect them
    const { data: affectedProfiles } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('last_workspace_id', workspaceId);

    const affectedUserIds = new Set((affectedProfiles || []).map(u => u.id));

    // Get workspace data (name + Ayrshare key) before deletion
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('ayr_profile_key, name')
      .eq('id', workspaceId)
      .single();

    if (workspaceError) {
      logError('workspace.delete.getWorkspace', workspaceError, { workspaceId });
    }

    const workspaceName = workspace?.name || 'Workspace';

    // Delete Ayrshare profile BEFORE deleting workspace (frees up Ayrshare quota)
    if (workspace?.ayr_profile_key) {
      console.log(`[WORKSPACE DELETE] Deleting Ayrshare profile for: ${workspaceName}`);
      const ayrDeleted = await deleteAyrshareProfile(workspace.ayr_profile_key);
      if (ayrDeleted) {
        console.log(`[WORKSPACE DELETE] ✅ Ayrshare profile deleted successfully`);
      } else {
        console.log(`[WORKSPACE DELETE] ⚠️ Ayrshare deletion failed - continuing. Manual cleanup may be needed for key: ${workspace.ayr_profile_key}`);
      }
    }

    // Clear last_workspace_id FK references BEFORE deleting the workspace
    // (FK constraint is NO ACTION — deletion will fail if any user_profiles still reference it)
    const { error: clearRefsError } = await supabase
      .from('user_profiles')
      .update({ last_workspace_id: null })
      .eq('last_workspace_id', workspaceId);

    if (clearRefsError) {
      logError('workspace.delete.clearLastWorkspaceRefs', clearRefsError, { workspaceId });
    }

    // Delete the workspace — CASCADE handles all child tables automatically
    const { error: deleteError } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', workspaceId);

    if (deleteError) {
      logError('workspace.delete.workspace', deleteError, { workspaceId });
      return sendError(res, "Failed to delete workspace", ErrorCodes.DATABASE_ERROR);
    }

    // Redirect every affected user to their next available workspace
    // and notify all members (except the deleter) that the workspace was deleted
    const notificationsToInsert = [];

    for (const memberId of memberUserIds) {
      // Find this member's next available workspace
      const { data: nextWorkspaces } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', memberId)
        .limit(1);

      const nextWorkspaceId = nextWorkspaces?.[0]?.workspace_id || null;

      // Update last_workspace_id for any member who had this as their active workspace
      if (affectedUserIds.has(memberId)) {
        await supabase
          .from('user_profiles')
          .update({ last_workspace_id: nextWorkspaceId })
          .eq('id', memberId);
      }

      // Notify everyone except the owner who triggered the deletion
      if (memberId !== userId) {
        notificationsToInsert.push({
          user_id: memberId,
          workspace_id: nextWorkspaceId,
          type: 'workspace_deleted',
          title: 'Workspace Deleted',
          message: `"${workspaceName}" has been deleted.`,
          actor_id: userId,
          metadata: { deletedWorkspaceName: workspaceName },
          read: false
        });
      }
    }

    if (notificationsToInsert.length > 0) {
      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notificationsToInsert);

      if (notifError) {
        logError('workspace.delete.notifications', notifError, { workspaceId, count: notificationsToInsert.length });
      }
    }

    // Also redirect the deleting owner to their next workspace
    if (affectedUserIds.has(userId)) {
      const { data: ownerNext } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .limit(1);

      const ownerNextId = ownerNext?.[0]?.workspace_id || null;
      await supabase
        .from('user_profiles')
        .update({ last_workspace_id: ownerNextId })
        .eq('id', userId);
    }

    return sendSuccess(res, {
      message: "Workspace deleted successfully",
      workspaceName
    });

  } catch (error) {
    logError('workspace.delete.handler', error);
    return sendError(res, "Failed to delete workspace", ErrorCodes.INTERNAL_ERROR);
  }
};
