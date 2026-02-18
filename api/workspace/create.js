const axios = require("axios");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidUUID,
  isServiceConfigured
} = require("../_utils");
const { getAgencyAccess } = require("../_utils-access-control");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

// Generate URL-friendly slug from name
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    + '-' + Date.now().toString(36);
};

// Create Ayrshare profile for Business Plan
const createAyrshareProfile = async (title) => {
  try {
    const response = await axios.post(
      `${BASE_AYRSHARE}/profiles/profile`,
      { title },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`
        },
        timeout: 30000
      }
    );

    return {
      profileKey: response.data.profileKey,
      refId: response.data.refId || null
    };
  } catch (error) {
    logError('workspace.create.ayrshareProfile', error);
    return null;
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
    const { userId, businessName, onBehalfOfUserId } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['userId', 'businessName']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate business name length
    if (businessName.length < 2 || businessName.length > 100) {
      return sendError(res, "Business name must be between 2 and 100 characters", ErrorCodes.VALIDATION_ERROR);
    }

    // Determine the effective owner — either the user themselves or the agency owner they manage for
    let effectiveOwnerId = userId;

    if (onBehalfOfUserId) {
      if (!isValidUUID(onBehalfOfUserId)) {
        return sendError(res, "Invalid onBehalfOfUserId format", ErrorCodes.VALIDATION_ERROR);
      }

      // Verify the calling user has can_manage_agency for this agency owner
      const access = await getAgencyAccess(supabase, userId);

      if (!access.hasAccess || !access.isManager || access.agencyOwnerId !== onBehalfOfUserId) {
        return sendError(res, "Not authorized to create workspaces on behalf of this user", ErrorCodes.FORBIDDEN);
      }

      effectiveOwnerId = onBehalfOfUserId;
    }

    // Create a new Ayrshare profile for this workspace (Business Plan feature)
    let ayrProfileKey = null;
    let ayrRefId = null;

    if (isServiceConfigured('ayrshare')) {
      const ayrProfile = await createAyrshareProfile(businessName);
      if (ayrProfile) {
        ayrProfileKey = ayrProfile.profileKey;
        ayrRefId = ayrProfile.refId;
      }
    }

    // If Ayrshare profile creation failed, fall back to env var
    // NOTE: ayr_profile_key is on workspaces table, not user_profiles
    if (!ayrProfileKey) {
      ayrProfileKey = process.env.AYRSHARE_PROFILE_KEY || null;
      ayrRefId = null;
    }

    // Create workspace in database (owned by the effective owner)
    const slug = generateSlug(businessName);

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: businessName,
        slug: slug,
        owner_id: effectiveOwnerId,
        ayr_profile_key: ayrProfileKey,
        ayr_ref_id: ayrRefId,
        onboarding_status: 'completed',
        subscription_status: 'active',
        subscription_tier: 'free'
      })
      .select()
      .single();

    if (workspaceError) {
      logError('workspace.create.insert', workspaceError, { userId, effectiveOwnerId, businessName });
      return sendError(res, "Failed to create workspace", ErrorCodes.DATABASE_ERROR);
    }

    // Add the effective owner as workspace owner with full permissions
    const { error: ownerMemberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: effectiveOwnerId,
        role: 'owner',
        can_manage_team: true,
        can_manage_settings: true,
        can_delete_posts: true,
        can_approve_posts: true,
        joined_at: new Date().toISOString()
      });

    if (ownerMemberError) {
      logError('workspace.create.addOwner', ownerMemberError, { workspaceId: workspace.id, effectiveOwnerId });
      // Try to clean up the workspace
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      return sendError(res, "Failed to add owner to workspace", ErrorCodes.DATABASE_ERROR);
    }

    // If created on behalf of someone, also add the acting user as a member with management permissions
    if (onBehalfOfUserId && userId !== effectiveOwnerId) {
      const { error: managerMemberError } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: workspace.id,
          user_id: userId,
          role: 'member',
          can_manage_team: true,
          can_manage_settings: true,
          can_delete_posts: true,
          can_approve_posts: true,
          joined_at: new Date().toISOString()
        });

      if (managerMemberError) {
        logError('workspace.create.addManager', managerMemberError, { workspaceId: workspace.id, userId });
        // Non-fatal — workspace and owner were created successfully
      }
    }

    // Update the acting user's last_workspace_id
    await supabase
      .from('user_profiles')
      .update({ last_workspace_id: workspace.id })
      .eq('id', userId);

    return sendSuccess(res, {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        ayr_profile_key: workspace.ayr_profile_key
      }
    });

  } catch (error) {
    logError('workspace.create.handler', error);
    return sendError(res, "Failed to create workspace", ErrorCodes.INTERNAL_ERROR);
  }
};
