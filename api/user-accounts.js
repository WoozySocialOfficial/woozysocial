const axios = require("axios");
const { setCors, getWorkspaceProfileKey, getWorkspaceProfileKeyForUser } = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

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

    // Get profile key - prefer workspaceId if provided, otherwise use userId fallback
    let profileKey;
    if (workspaceId) {
      profileKey = await getWorkspaceProfileKey(workspaceId);
    } else if (userId) {
      profileKey = await getWorkspaceProfileKeyForUser(userId);
    }

    if (!profileKey) {
      return res.status(200).json({ accounts: [], activeSocialAccounts: [] });
    }

    const response = await axios.get(`${BASE_AYRSHARE}/user`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    const { displayNames } = response.data;

    if (!displayNames || !Array.isArray(displayNames)) {
      return res.status(200).json({ accounts: [], activeSocialAccounts: [] });
    }

    const platformNames = displayNames.map((account) => account.platform);

    // Return both formats for compatibility with different components
    res.status(200).json({
      accounts: platformNames,
      activeSocialAccounts: platformNames
    });
  } catch (error) {
    console.error("Error fetching user accounts:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch user accounts", accounts: [], activeSocialAccounts: [] });
  }
};
