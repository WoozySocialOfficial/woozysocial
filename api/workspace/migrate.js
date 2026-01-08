const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../_utils");

// Generate URL-friendly slug from name
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    + '-' + Date.now().toString(36);
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
    const { userId } = req.body;

    if (!userId) {
      return sendError(res, "userId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Check if user already has a workspace
    const { data: existingMemberships, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id, workspaces(*)')
      .eq('user_id', userId)
      .limit(1);

    if (membershipError) {
      logError('workspace.migrate.checkExisting', membershipError, { userId });
      return sendError(res, "Failed to check existing workspaces", ErrorCodes.DATABASE_ERROR);
    }

    if (existingMemberships && existingMemberships.length > 0) {
      // User already has a workspace, return the first one
      const existingMembership = existingMemberships[0];
      return sendSuccess(res, {
        migrated: false,
        workspace: existingMembership.workspaces
      });
    }

    // Get user's profile to get their Ayrshare profile key
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('full_name, email, ayr_profile_key, ayr_ref_id')
      .eq('id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      logError('workspace.migrate.getProfile', profileError, { userId });
    }

    // Create default workspace for user
    const workspaceName = userProfile?.full_name
      ? `${userProfile.full_name}'s Business`
      : 'My Business';
    const slug = generateSlug(workspaceName);

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceName,
        slug: slug,
        ayr_profile_key: userProfile?.ayr_profile_key || null,
        ayr_ref_id: userProfile?.ayr_ref_id || null
      })
      .select()
      .single();

    if (workspaceError) {
      logError('workspace.migrate.createWorkspace', workspaceError, { userId });
      return sendError(res, "Failed to create workspace", ErrorCodes.DATABASE_ERROR);
    }

    // Add user as owner
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner'
      });

    if (memberError) {
      logError('workspace.migrate.addOwner', memberError, { userId, workspaceId: workspace.id });
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      return sendError(res, "Failed to add user to workspace", ErrorCodes.DATABASE_ERROR);
    }

    // Migrate existing posts to this workspace
    const { error: postsError } = await supabase
      .from('posts')
      .update({ workspace_id: workspace.id })
      .eq('user_id', userId)
      .is('workspace_id', null);

    if (postsError) {
      logError('workspace.migrate.posts', postsError, { userId, workspaceId: workspace.id });
    }

    // Migrate existing connected accounts to this workspace
    const { error: accountsError } = await supabase
      .from('connected_accounts')
      .update({ workspace_id: workspace.id })
      .eq('user_id', userId)
      .is('workspace_id', null);

    if (accountsError) {
      logError('workspace.migrate.accounts', accountsError, { userId, workspaceId: workspace.id });
    }

    // Update user's last_workspace_id
    await supabase
      .from('user_profiles')
      .update({ last_workspace_id: workspace.id })
      .eq('id', userId);

    return sendSuccess(res, {
      migrated: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug
      }
    });

  } catch (error) {
    logError('workspace.migrate.handler', error);
    return sendError(res, "Failed to migrate user to workspace", ErrorCodes.INTERNAL_ERROR);
  }
};
