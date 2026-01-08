const axios = require("axios");
const { setCors, getSupabase } = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

// Get workspace profile key from database
const getWorkspaceProfileKey = async (workspaceId) => {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('ayr_profile_key, name')
      .eq('id', workspaceId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching workspace:', error);
    return null;
  }
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

    return response.data.profileKey;
  } catch (error) {
    console.error("Error creating Ayrshare profile:", error.response?.data || error.message);
    return null;
  }
};

// Update workspace with profile key
const updateWorkspaceProfileKey = async (workspaceId, profileKey) => {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('workspaces')
      .update({ ayr_profile_key: profileKey })
      .eq('id', workspaceId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating workspace profile key:', error);
    return false;
  }
};

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userId, workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    // Get workspace profile key for connecting accounts
    const workspace = await getWorkspaceProfileKey(workspaceId);

    if (!workspace) {
      return res.status(400).json({ error: "Workspace not found" });
    }

    let profileKey = workspace.ayr_profile_key;

    // If no profile key exists, create one automatically (Business Plan feature)
    if (!profileKey && process.env.AYRSHARE_API_KEY) {
      profileKey = await createAyrshareProfile(workspace.name || 'My Business');

      if (profileKey) {
        // Save the new profile key to the workspace
        await updateWorkspaceProfileKey(workspaceId, profileKey);
      }
    }

    if (!profileKey) {
      return res.status(400).json({ error: "Failed to create Ayrshare profile. Please contact support." });
    }

    if (!process.env.AYRSHARE_PRIVATE_KEY) {
      return res.status(500).json({ error: "AYRSHARE_PRIVATE_KEY not configured" });
    }

    if (!process.env.AYRSHARE_DOMAIN) {
      return res.status(500).json({ error: "AYRSHARE_DOMAIN not configured" });
    }

    if (!process.env.AYRSHARE_API_KEY) {
      return res.status(500).json({ error: "AYRSHARE_API_KEY not configured" });
    }

    // Handle private key - support both escaped \n and actual newlines
    let privateKey = process.env.AYRSHARE_PRIVATE_KEY;
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const jwtData = {
      domain: process.env.AYRSHARE_DOMAIN,
      privateKey,
      profileKey: profileKey,
      verify: true,
      logout: true
    };

    const response = await axios.post(
      `${BASE_AYRSHARE}/profiles/generateJWT`,
      jwtData,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`
        }
      }
    );

    res.status(200).json({ url: response.data.url });
  } catch (error) {
    console.error("Error generating JWT URL:", error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
    res.status(500).json({ error: "Failed to generate JWT URL", details: errorMessage });
  }
};
