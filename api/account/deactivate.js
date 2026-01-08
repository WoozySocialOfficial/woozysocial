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
    const { userId, confirmEmail } = req.body;
    const supabase = getSupabase();

    if (!supabase) {
      return res.status(500).json({ error: "Database not configured" });
    }

    if (!userId || !confirmEmail) {
      return res.status(400).json({ error: "userId and confirmEmail are required" });
    }

    // Get user's email to verify confirmation
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify email confirmation matches
    if (profile.email.toLowerCase() !== confirmEmail.toLowerCase()) {
      return res.status(400).json({ error: "Email confirmation does not match" });
    }

    // Check if user owns any workspaces - they must transfer ownership first
    const { data: ownedWorkspaces } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('role', 'owner');

    if (ownedWorkspaces && ownedWorkspaces.length > 0) {
      return res.status(400).json({
        error: "You must transfer ownership of your workspaces before deactivating your account",
        workspaceCount: ownedWorkspaces.length
      });
    }

    // Remove user from all workspaces
    await supabase
      .from('workspace_members')
      .delete()
      .eq('user_id', userId);

    // Cancel any pending invitations sent by this user
    await supabase
      .from('workspace_invitations')
      .update({ status: 'cancelled' })
      .eq('invited_by', userId)
      .eq('status', 'pending');

    // Mark user profile as deactivated
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        deactivated_at: new Date().toISOString(),
        full_name: '[Deactivated User]'
      })
      .eq('id', userId);

    if (updateError) {
      return res.status(500).json({ error: "Failed to deactivate account" });
    }

    // Delete the auth user (this will sign them out everywhere)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      // Profile is already marked as deactivated, so this is semi-successful
    }

    res.status(200).json({ success: true, message: "Account deactivated successfully" });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to deactivate account" });
  }
};
