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

    // Delete workspace members first (foreign key constraint)
    const { error: membersDeleteError } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId);

    if (membersDeleteError) {
      logError('workspace.delete.members', membersDeleteError, { workspaceId });
    }

    // Delete workspace invitations
    const { error: invitesDeleteError } = await supabase
      .from('workspace_invitations')
      .delete()
      .eq('workspace_id', workspaceId);

    if (invitesDeleteError) {
      logError('workspace.delete.invitations', invitesDeleteError, { workspaceId });
    }

    // Delete post drafts for this workspace
    const { error: draftsDeleteError } = await supabase
      .from('post_drafts')
      .delete()
      .eq('workspace_id', workspaceId);

    if (draftsDeleteError) {
      logError('workspace.delete.drafts', draftsDeleteError, { workspaceId });
    }

    // Delete brand profiles for this workspace
    const { error: brandDeleteError } = await supabase
      .from('brand_profiles')
      .delete()
      .eq('workspace_id', workspaceId);

    if (brandDeleteError) {
      logError('workspace.delete.brandProfiles', brandDeleteError, { workspaceId });
    }

    // Get workspace data to retrieve Ayrshare profile key before deletion
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('ayr_profile_key, name')
      .eq('id', workspaceId)
      .single();

    if (workspaceError) {
      logError('workspace.delete.getWorkspace', workspaceError, { workspaceId });
      // Continue anyway - deletion should still proceed
    }

    // Delete Ayrshare profile BEFORE deleting workspace
    // This frees up your Ayrshare quota
    if (workspace?.ayr_profile_key) {
      console.log(`[WORKSPACE DELETE] Attempting to delete Ayrshare profile for workspace: ${workspace.name}`);
      const ayrDeleted = await deleteAyrshareProfile(workspace.ayr_profile_key);
      if (ayrDeleted) {
        console.log(`[WORKSPACE DELETE] ✅ Ayrshare profile deleted successfully`);
      } else {
        console.log(`[WORKSPACE DELETE] ⚠️ Ayrshare profile deletion failed - continuing with workspace deletion`);
        console.log(`[WORKSPACE DELETE] You may need to manually delete profile key: ${workspace.ayr_profile_key} from Ayrshare dashboard`);
      }
    }

    // Clear ALL user_profiles.last_workspace_id references to this workspace
    // This MUST happen before workspace deletion to avoid FK constraint violation
    const { error: clearRefsError } = await supabase
      .from('user_profiles')
      .update({ last_workspace_id: null })
      .eq('last_workspace_id', workspaceId);

    if (clearRefsError) {
      logError('workspace.delete.clearLastWorkspaceRefs', clearRefsError, { workspaceId });
      // Continue anyway - we'll handle setting new active workspace for current user later
    }

    // Delete the workspace
    const { error: deleteError } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', workspaceId);

    if (deleteError) {
      logError('workspace.delete.workspace', deleteError, { workspaceId });
      return sendError(res, "Failed to delete workspace", ErrorCodes.DATABASE_ERROR);
    }

    // Set current user's last_workspace_id to one of their remaining workspaces
    // (We cleared it to null earlier to avoid FK constraint violation)
    const { data: remainingWorkspaces } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .limit(1);

    const newActiveId = remainingWorkspaces?.[0]?.workspace_id || null;

    const { error: updateProfileError } = await supabase
      .from('user_profiles')
      .update({ last_workspace_id: newActiveId })
      .eq('id', userId);

    if (updateProfileError) {
      logError('workspace.delete.updateUserProfile', updateProfileError, { userId, newActiveId });
      // Don't fail the request - workspace is already deleted successfully
    }

    return sendSuccess(res, { message: "Workspace deleted successfully" });

  } catch (error) {
    logError('workspace.delete.handler', error);
    return sendError(res, "Failed to delete workspace", ErrorCodes.INTERNAL_ERROR);
  }
};
