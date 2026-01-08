const { setCors, getSupabase } = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userId } = req.body;
    const supabase = getSupabase();

    if (!supabase) {
      return res.status(500).json({ error: "Database not configured" });
    }

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Sign out user from all sessions by updating their auth metadata
    // This invalidates all existing tokens
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...user.user?.app_metadata,
        sessions_invalidated_at: new Date().toISOString()
      }
    });

    if (updateError) {
      console.error("Error invalidating sessions:", updateError);
      return res.status(500).json({ error: "Failed to logout from all devices" });
    }

    res.status(200).json({
      success: true,
      message: "Logged out from all devices successfully"
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to logout from all devices" });
  }
};
