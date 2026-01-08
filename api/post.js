const axios = require("axios");
const { setCors, getWorkspaceProfileKey, getWorkspaceProfileKeyForUser, getSupabase } = require("./_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

// Helper to check if workspace has client members who need to approve
async function workspaceHasClients(supabase, workspaceId) {
  if (!workspaceId) return false;

  const { data: clients } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('role', 'view_only')
    .limit(1);

  return clients && clients.length > 0;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabase();

  try {
    const { text, networks, scheduledDate, userId, workspaceId, mediaUrl } = req.body;

    const platforms = Object.entries(JSON.parse(networks))
      .filter(([, value]) => value)
      .map(([key]) => key);

    const isScheduled = !!scheduledDate;

    // Check if workspace has clients who need to approve scheduled posts
    const hasClients = supabase ? await workspaceHasClients(supabase, workspaceId) : false;
    const requiresApproval = isScheduled && hasClients;

    // If scheduled and has clients, save to DB only - wait for approval
    if (requiresApproval) {
      if (supabase) {
        const { data: savedPost, error: saveError } = await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrl ? [mediaUrl] : [],
          status: 'pending_approval',
          scheduled_at: new Date(scheduledDate).toISOString(),
          platforms: platforms,
          approval_status: 'pending',
          requires_approval: true
        }]).select().single();

        if (saveError) throw saveError;

        return res.status(200).json({
          success: true,
          status: 'pending_approval',
          message: 'Post saved and awaiting client approval',
          postId: savedPost?.id
        });
      }
    }

    // No clients or immediate post - send to Ayrshare directly
    let profileKey;
    if (workspaceId) {
      profileKey = await getWorkspaceProfileKey(workspaceId);
    }
    if (!profileKey && userId) {
      profileKey = await getWorkspaceProfileKeyForUser(userId);
    }

    if (!profileKey) {
      return res.status(400).json({ error: "No Ayrshare profile found. Please connect your social accounts first." });
    }

    const postData = { post: text, platforms };

    if (scheduledDate) {
      const dateObj = new Date(scheduledDate);
      const timestampSeconds = Math.floor(dateObj.getTime() / 1000);
      postData.scheduleDate = timestampSeconds;
    }

    if (mediaUrl) {
      postData.mediaUrls = [mediaUrl];
    }

    const response = await axios.post(`${BASE_AYRSHARE}/post`, postData, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    if (response.data.status === 'error') {
      // Save failed post to database
      if (supabase) {
        await supabase.from("posts").insert([{
          user_id: userId,
          workspace_id: workspaceId,
          created_by: userId,
          caption: text,
          media_urls: mediaUrl ? [mediaUrl] : [],
          status: 'failed',
          scheduled_at: scheduledDate ? new Date(scheduledDate).toISOString() : null,
          platforms: platforms,
          last_error: response.data.message || 'Post failed'
        }]);
      }
      return res.status(400).json({ error: "Post failed", details: response.data });
    }

    // Save successful post to database
    if (supabase) {
      const ayrPostId = response.data.id || response.data.postId;
      await supabase.from("posts").insert([{
        user_id: userId,
        workspace_id: workspaceId,
        created_by: userId,
        ayr_post_id: ayrPostId,
        caption: text,
        media_urls: mediaUrl ? [mediaUrl] : [],
        status: isScheduled ? 'scheduled' : 'posted',
        scheduled_at: isScheduled ? new Date(scheduledDate).toISOString() : null,
        posted_at: isScheduled ? null : new Date().toISOString(),
        platforms: platforms,
        approval_status: 'approved',
        requires_approval: false
      }]);
    }

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error posting:", error.response?.data || error.message);

    // Save error to database
    if (supabase) {
      const { text, networks, scheduledDate, userId, workspaceId, mediaUrl } = req.body;
      const platforms = Object.entries(JSON.parse(networks || '{}'))
        .filter(([, value]) => value)
        .map(([key]) => key);

      await supabase.from("posts").insert([{
        user_id: userId,
        workspace_id: workspaceId,
        created_by: userId,
        caption: text,
        media_urls: mediaUrl ? [mediaUrl] : [],
        status: 'failed',
        scheduled_at: scheduledDate ? new Date(scheduledDate).toISOString() : null,
        platforms: platforms,
        last_error: error.response?.data?.message || error.message
      }]);
    }

    res.status(500).json({ error: "Failed to post", details: error.response?.data || error.message });
  }
};
