const { setCors, getSupabase } = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { token } = req.query;
    const supabase = getSupabase();

    if (!supabase) {
      return res.status(500).json({ error: "Database not configured" });
    }

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const { data: invitation, error } = await supabase
      .from('team_invitations')
      .select('id, email, role, status, invited_at, expires_at, owner_id')
      .eq('invite_token', token)
      .single();

    if (error || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Check if invitation has expired
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      // Update status to expired
      await supabase
        .from('team_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return res.status(400).json({ error: 'This invitation has expired' });
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: `This invitation has already been ${invitation.status}` });
    }

    res.status(200).json({ data: invitation });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: "Failed to validate invitation" });
  }
};
