const axios = require("axios");
const { setCors, getSupabase, getWorkspaceProfileKey } = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { platform, userId, workspaceId } = req.body;
    const supabase = getSupabase();

    if (!supabase) {
      return res.status(500).json({ error: "Database not configured" });
    }

    if (!platform || !userId) {
      return res.status(400).json({ error: "platform and userId are required" });
    }

    // Valid platforms for Ayrshare
    const validPlatforms = [
      'facebook', 'instagram', 'twitter', 'linkedin',
      'youtube', 'tiktok', 'pinterest', 'reddit', 'telegram'
    ];

    if (!validPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({ error: "Invalid platform" });
    }

    // Get the profile key for the workspace or user
    let profileKey = null;
    if (workspaceId) {
      profileKey = await getWorkspaceProfileKey(workspaceId);
    }

    if (!profileKey) {
      // Fall back to user's profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('ayr_profile_key')
        .eq('id', userId)
        .single();

      profileKey = profile?.ayr_profile_key;
    }

    if (!profileKey) {
      return res.status(400).json({ error: "No Ayrshare profile found" });
    }

    // Call Ayrshare API to unlink the social account
    const response = await axios.delete(`${BASE_AYRSHARE}/profiles/social/${platform.toLowerCase()}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    if (response.data.status === "success" || response.status === 200) {
      res.status(200).json({
        success: true,
        message: `${platform} disconnected successfully`
      });
    } else {
      res.status(400).json({
        error: "Failed to disconnect platform",
        details: response.data
      });
    }
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to disconnect social account",
      details: error.response?.data?.message || error.message
    });
  }
};
