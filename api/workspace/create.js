const axios = require("axios");
const { setCors, getSupabase } = require("../_utils");

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
        }
      }
    );

    return {
      profileKey: response.data.profileKey,
      refId: response.data.refId || null
    };
  } catch (error) {
    console.error("Error creating Ayrshare profile:", error.response?.data || error.message);
    return null;
  }
};

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userId, businessName } = req.body;
    const supabase = getSupabase();

    if (!supabase) {
      return res.status(500).json({ error: "Database not configured" });
    }

    if (!userId || !businessName) {
      return res.status(400).json({ error: "userId and businessName are required" });
    }

    // Create a new Ayrshare profile for this workspace (Business Plan feature)
    let ayrProfileKey = null;
    let ayrRefId = null;

    if (process.env.AYRSHARE_API_KEY) {
      const ayrProfile = await createAyrshareProfile(businessName);
      if (ayrProfile) {
        ayrProfileKey = ayrProfile.profileKey;
        ayrRefId = ayrProfile.refId;
      }
    }

    // If Ayrshare profile creation failed, fall back to owner's profile key or env var
    if (!ayrProfileKey) {
      const { data: ownerProfile } = await supabase
        .from('user_profiles')
        .select('ayr_profile_key, ayr_ref_id')
        .eq('id', userId)
        .single();

      ayrProfileKey = ownerProfile?.ayr_profile_key || process.env.AYRSHARE_PROFILE_KEY || null;
      ayrRefId = ownerProfile?.ayr_ref_id || null;
    }

    // Create workspace in database - all businesses share owner's Ayrshare profile
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
      console.error("Workspace creation error:", workspaceError);
      return res.status(500).json({ error: "Failed to create workspace" });
    }

    // 3. Add user as owner of the workspace
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner'
      });

    if (memberError) {
      console.error("Member creation error:", memberError);
      // Try to clean up the workspace
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      return res.status(500).json({ error: "Failed to add user to workspace" });
    }

    // 4. Update user's last_workspace_id
    await supabase
      .from('user_profiles')
      .update({ last_workspace_id: workspace.id })
      .eq('id', userId);

    res.status(200).json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        ayr_profile_key: workspace.ayr_profile_key
      }
    });

  } catch (error) {
    console.error("Error creating workspace:", error);
    res.status(500).json({ error: "Failed to create workspace" });
  }
};
