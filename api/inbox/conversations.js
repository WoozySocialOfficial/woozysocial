const axios = require("axios");
const { setCors, getWorkspaceProfileKey, getSupabase } = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";
const SUPPORTED_PLATFORMS = ['facebook', 'instagram', 'twitter'];

/**
 * GET /api/inbox/conversations
 * Fetches all DM conversations from Ayrshare and syncs to local cache
 *
 * Query params:
 * - workspaceId: Required workspace ID
 * - platform: Optional filter (facebook, instagram, twitter, or 'all')
 * - refresh: If 'true', force refresh from Ayrshare API
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Database connection not available" });
  }

  try {
    const { workspaceId, platform = 'all', refresh = 'false' } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return res.status(400).json({ error: "No Ayrshare profile found for this workspace" });
    }

    const shouldRefresh = refresh === 'true';
    const platformsToFetch = platform === 'all' ? SUPPORTED_PLATFORMS : [platform];

    // Check if we should fetch from Ayrshare or use cache
    if (shouldRefresh) {
      await syncConversationsFromAyrshare(supabase, workspaceId, profileKey, platformsToFetch);
    }

    // Fetch from local cache
    let query = supabase
      .from('inbox_conversations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (platform !== 'all') {
      query = query.eq('platform', platform);
    }

    const { data: conversations, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate total unread
    const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);

    // Group by platform for stats
    const platformStats = SUPPORTED_PLATFORMS.reduce((acc, p) => {
      const platformConvs = conversations.filter(c => c.platform === p);
      acc[p] = {
        total: platformConvs.length,
        unread: platformConvs.reduce((sum, c) => sum + (c.unread_count || 0), 0)
      };
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      conversations: conversations || [],
      totalUnread,
      platformStats,
      platforms: SUPPORTED_PLATFORMS
    });

  } catch (error) {
    console.error("Error fetching conversations:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch conversations",
      details: error.response?.data || error.message
    });
  }
};

/**
 * Sync conversations from Ayrshare API to local Supabase cache
 */
async function syncConversationsFromAyrshare(supabase, workspaceId, profileKey, platforms) {
  const results = [];

  for (const platform of platforms) {
    try {
      // Fetch conversations from Ayrshare
      const response = await axios.get(`${BASE_AYRSHARE}/messages/${platform}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        }
      });

      const ayrshareConversations = response.data?.conversations || response.data || [];

      // Upsert each conversation to local cache
      for (const conv of ayrshareConversations) {
        const conversationData = {
          workspace_id: workspaceId,
          platform: platform,
          ayrshare_conversation_id: conv.conversationId || conv.id,
          correspondent_id: conv.correspondentId || conv.senderId || conv.userId,
          correspondent_name: conv.correspondentName || conv.senderName || conv.name || 'Unknown',
          correspondent_username: conv.correspondentUsername || conv.username,
          correspondent_avatar: conv.correspondentAvatar || conv.avatar || conv.profilePicture,
          last_message_text: conv.lastMessage?.text || conv.lastMessageText || conv.snippet,
          last_message_at: conv.lastMessage?.timestamp || conv.lastMessageAt || conv.updatedAt,
          last_message_sender: conv.lastMessage?.isFromUser ? 'user' : 'correspondent',
          unread_count: conv.unreadCount || 0,
          can_reply: checkCanReply(platform, conv),
          metadata: {
            raw: conv,
            syncedAt: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('inbox_conversations')
          .upsert(conversationData, {
            onConflict: 'workspace_id,platform,ayrshare_conversation_id'
          });

        if (error) {
          console.error(`Error upserting conversation ${conv.conversationId}:`, error);
        } else {
          results.push(conversationData);
        }
      }

    } catch (platformError) {
      console.error(`Error fetching ${platform} conversations:`, platformError.response?.data || platformError.message);
      // Continue with other platforms
    }
  }

  return results;
}

/**
 * Check if we can reply to this conversation
 * Instagram has a 7-day window restriction
 */
function checkCanReply(platform, conversation) {
  if (platform !== 'instagram') {
    return true;
  }

  // Check if last correspondent message was within 7 days
  const lastCorrespondentMessage = conversation.lastMessage?.timestamp || conversation.lastMessageAt;
  if (!lastCorrespondentMessage) {
    return true;
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const messageDate = new Date(lastCorrespondentMessage);
  return messageDate > sevenDaysAgo;
}
