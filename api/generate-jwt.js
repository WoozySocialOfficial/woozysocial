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

    // Get workspace profile key for connecting accounts
    const profileKey = await getWorkspaceProfileKey(workspaceId);

    if (!process.env.AYRSHARE_PRIVATE_KEY) {
      return res.status(500).json({ error: "AYRSHARE_PRIVATE_KEY not configured" });
    }
    const privateKey = process.env.AYRSHARE_PRIVATE_KEY.replace(/\\n/g, '\n');

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
    res.status(500).json({ error: "Failed to generate JWT URL" });
  }
};
