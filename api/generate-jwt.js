const axios = require("axios");
const { setCors, getWorkspaceProfileKey } = require("./_utils");

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

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    // Get workspace profile key for connecting accounts
    const profileKey = await getWorkspaceProfileKey(workspaceId);

    if (!profileKey) {
      return res.status(400).json({ error: "No Ayrshare profile found for this workspace. Please contact support." });
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

    console.log("Generating JWT for workspace:", workspaceId, "with profileKey:", profileKey);

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
