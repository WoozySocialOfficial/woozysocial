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
    const { userId, businessName } = req.body;

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

    // If Ayrshare profile creation failed, fall back to owner's profile key or env var
    if (!ayrProfileKey) {
      const { data: ownerProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('ayr_profile_key, ayr_ref_id')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        logError('workspace.create.getOwnerProfile', profileError, { userId });
      }

      ayrProfileKey = ownerProfile?.ayr_profile_key || process.env.AYRSHARE_PROFILE_KEY || null;
      ayrRefId = ownerProfile?.ayr_ref_id || null;
    }

    // Create workspace in database
    const slug = generateSlug(businessName);

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: businessName,
        slug: slug,
        owner_id: userId,
        ayr_profile_key: ayrProfileKey,
        ayr_ref_id: ayrRefId
      })
      .select()
      .single();

    if (workspaceError) {
      logError('workspace.create.insert', workspaceError, { userId, businessName });
      return sendError(res, "Failed to create workspace", ErrorCodes.DATABASE_ERROR);
    }

    // Add user as owner of the workspace
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner'
      });

    if (memberError) {
      logError('workspace.create.addOwner', memberError, { workspaceId: workspace.id, userId });
      // Try to clean up the workspace
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      return sendError(res, "Failed to add user to workspace", ErrorCodes.DATABASE_ERROR);
    }

    // Update user's last_workspace_id
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
