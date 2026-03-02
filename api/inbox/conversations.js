const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  isServiceConfigured
} = require("../_utils");

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
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { workspaceId, platform = 'all', refresh = 'false' } = req.query;

    if (!workspaceId) {
      return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate platform
    if (platform !== 'all' && !SUPPORTED_PLATFORMS.includes(platform)) {
      return sendError(
        res,
        `Invalid platform. Must be 'all' or one of: ${SUPPORTED_PLATFORMS.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No social accounts connected for this workspace", ErrorCodes.VALIDATION_ERROR);
    }

    const shouldRefresh = refresh === 'true';
    const platformsToFetch = platform === 'all' ? SUPPORTED_PLATFORMS : [platform];

    // Check if we should fetch from Ayrshare or use cache
    let syncResults = null;
    if (shouldRefresh && isServiceConfigured('ayrshare')) {
      syncResults = await syncConversationsFromAyrshare(supabase, workspaceId, profileKey, platformsToFetch);
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
      logError('inbox.conversations.fetch', error, { workspaceId });
      return sendError(res, "Failed to fetch conversations", ErrorCodes.DATABASE_ERROR);
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

    const responseData = {
      conversations: conversations || [],
      totalUnread,
      platformStats,
      platforms: SUPPORTED_PLATFORMS
    };

    // Include sync diagnostics when refresh was requested
    if (syncResults) {
      responseData.syncDiagnostics = syncResults;
    }

    return sendSuccess(res, responseData);

  } catch (error) {
    logError('inbox.conversations.handler', error);
    return sendError(res, "Failed to fetch conversations", ErrorCodes.INTERNAL_ERROR);
  }
};

/**
 * Sync conversations from Ayrshare API to local Supabase cache
 */
async function syncConversationsFromAyrshare(supabase, workspaceId, profileKey, platforms) {
  const results = [];
  const diagnostics = { platforms: {}, totalSynced: 0 };

  for (const platform of platforms) {
    const platformDiag = { status: 'pending', conversationsFound: 0, error: null, rawResponseType: null };
    diagnostics.platforms[platform] = platformDiag;

    try {
      // Fetch conversations from Ayrshare
      const response = await axios.get(`${BASE_AYRSHARE}/messages/${platform}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        },
        timeout: 30000
      });

      // Log the raw response shape for debugging
      platformDiag.rawResponseType = typeof response.data;
      platformDiag.rawResponseKeys = response.data ? Object.keys(response.data) : [];
      platformDiag.httpStatus = response.status;

      const ayrshareConversations = response.data?.conversations || response.data || [];
      const isArray = Array.isArray(ayrshareConversations);
      platformDiag.isArray = isArray;
      platformDiag.conversationsFound = isArray ? ayrshareConversations.length : 0;

      if (!isArray) {
        platformDiag.status = 'unexpected_format';
        platformDiag.rawSnippet = JSON.stringify(response.data).substring(0, 300);
        continue;
      }

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
          logError('inbox.conversations.sync.upsert', error, { conversationId: conv.conversationId });
          platformDiag.dbError = error.message;
        } else {
          results.push(conversationData);
          diagnostics.totalSynced++;
        }
      }

      platformDiag.status = 'success';

    } catch (platformError) {
      logError('inbox.conversations.sync.platform', platformError, { platform });
      platformDiag.status = 'error';
      platformDiag.error = platformError.response?.data?.message || platformError.response?.data?.error || platformError.message;
      platformDiag.httpStatus = platformError.response?.status;
      // Continue with other platforms
    }
  }

  return diagnostics;
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
