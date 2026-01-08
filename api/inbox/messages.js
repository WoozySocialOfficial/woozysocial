const axios = require("axios");
const { setCors, getWorkspaceProfileKey, getSupabase, parseBody } = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * Messages API Handler
 *
 * GET /api/inbox/messages?conversationId=xxx&workspaceId=xxx&platform=facebook
 * - Fetches messages for a specific conversation
 *
 * POST /api/inbox/messages
 * - Sends a new message in a conversation
 * Body: { workspaceId, platform, conversationId, message, mediaUrl? }
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Database connection not available" });
  }

  if (req.method === "GET") {
    return handleGetMessages(req, res, supabase);
  } else if (req.method === "POST") {
    return handleSendMessage(req, res, supabase);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
};

/**
 * GET: Fetch messages for a conversation
 */
async function handleGetMessages(req, res, supabase) {
  try {
    const { conversationId, workspaceId, platform, refresh = 'false' } = req.query;

    if (!conversationId || !workspaceId || !platform) {
      return res.status(400).json({
        error: "conversationId, workspaceId, and platform are required"
      });
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return res.status(400).json({ error: "No Ayrshare profile found for this workspace" });
    }

    // Get the local conversation record
    const { data: conversation, error: convError } = await supabase
      .from('inbox_conversations')
      .select('id, ayrshare_conversation_id, can_reply')
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const ayrshareConversationId = conversation.ayrshare_conversation_id;

    // Fetch messages from Ayrshare if refresh requested
    if (refresh === 'true') {
      await syncMessagesFromAyrshare(
        supabase,
        conversationId,
        ayrshareConversationId,
        platform,
        profileKey
      );
    }

    // Fetch messages from local cache
    const { data: messages, error: msgError } = await supabase
      .from('inbox_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('sent_at', { ascending: true });

    if (msgError) {
      throw msgError;
    }

    res.status(200).json({
      success: true,
      messages: messages || [],
      conversationId,
      canReply: conversation.can_reply
    });

  } catch (error) {
    console.error("Error fetching messages:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch messages",
      details: error.response?.data || error.message
    });
  }
}

/**
 * POST: Send a new message
 */
async function handleSendMessage(req, res, supabase) {
  try {
    const body = await parseBody(req);
    const { workspaceId, platform, conversationId, message, mediaUrl } = body;

    if (!workspaceId || !platform || !conversationId || !message) {
      return res.status(400).json({
        error: "workspaceId, platform, conversationId, and message are required"
      });
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return res.status(400).json({ error: "No Ayrshare profile found for this workspace" });
    }

    // Get the conversation to check if we can reply and get Ayrshare conversation ID
    const { data: conversation, error: convError } = await supabase
      .from('inbox_conversations')
      .select('id, ayrshare_conversation_id, correspondent_id, can_reply')
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (!conversation.can_reply) {
      return res.status(400).json({
        error: "Cannot reply to this conversation. Instagram conversations expire after 7 days of inactivity."
      });
    }

    // Build message payload for Ayrshare
    const messagePayload = {
      conversationId: conversation.ayrshare_conversation_id,
      message: message
    };

    if (mediaUrl) {
      messagePayload.mediaUrls = [mediaUrl];
    }

    // Send message via Ayrshare
    const response = await axios.post(
      `${BASE_AYRSHARE}/messages/${platform}`,
      messagePayload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        }
      }
    );

    if (response.data.status === 'error') {
      return res.status(400).json({
        error: "Failed to send message",
        details: response.data
      });
    }

    // Save message to local cache
    const sentMessage = {
      conversation_id: conversationId,
      ayrshare_message_id: response.data.id || response.data.messageId,
      platform_message_id: response.data.platformMessageId,
      sender_type: 'user',
      sender_name: 'You',
      message_text: message,
      media_urls: mediaUrl ? [mediaUrl] : [],
      sent_at: new Date().toISOString(),
      metadata: { ayrshareResponse: response.data }
    };

    const { data: savedMessage, error: saveError } = await supabase
      .from('inbox_messages')
      .insert([sentMessage])
      .select()
      .single();

    if (saveError) {
      console.error("Error saving sent message:", saveError);
    }

    // Update conversation's last message
    await supabase
      .from('inbox_conversations')
      .update({
        last_message_text: message,
        last_message_at: new Date().toISOString(),
        last_message_sender: 'user',
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    res.status(200).json({
      success: true,
      message: savedMessage || sentMessage,
      ayrshareResponse: response.data
    });

  } catch (error) {
    console.error("Error sending message:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to send message",
      details: error.response?.data || error.message
    });
  }
}

/**
 * Sync messages from Ayrshare to local cache
 */
async function syncMessagesFromAyrshare(supabase, localConversationId, ayrshareConversationId, platform, profileKey) {
  try {
    const response = await axios.get(
      `${BASE_AYRSHARE}/messages/${platform}`,
      {
        params: { conversationId: ayrshareConversationId },
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        }
      }
    );

    const ayrshareMessages = response.data?.messages || response.data || [];

    for (const msg of ayrshareMessages) {
      const messageData = {
        conversation_id: localConversationId,
        ayrshare_message_id: msg.id || msg.messageId,
        platform_message_id: msg.platformMessageId || msg.mid,
        sender_type: msg.isFromUser ? 'user' : 'correspondent',
        sender_name: msg.isFromUser ? 'You' : (msg.senderName || msg.from?.name || 'Contact'),
        message_text: msg.text || msg.message || msg.content,
        media_urls: msg.mediaUrls || msg.attachments || [],
        media_type: msg.mediaType || (msg.attachments?.length > 0 ? 'attachment' : null),
        sent_at: msg.timestamp || msg.createdAt || msg.sentAt,
        metadata: { raw: msg }
      };

      // Upsert to avoid duplicates
      const { error } = await supabase
        .from('inbox_messages')
        .upsert(messageData, {
          onConflict: 'ayrshare_message_id',
          ignoreDuplicates: true
        });

      if (error && error.code !== '23505') { // Ignore unique violation
        console.error(`Error upserting message:`, error);
      }
    }

    return ayrshareMessages.length;

  } catch (error) {
    console.error("Error syncing messages from Ayrshare:", error.response?.data || error.message);
    throw error;
  }
}
