const axios = require("axios");
const {
  setCors,
  getWorkspaceProfileKey,
  getSupabase,
  parseBody,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  isServiceConfigured
} = require("../_utils");

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
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  if (req.method === "GET") {
    return handleGetMessages(req, res, supabase);
  } else if (req.method === "POST") {
    return handleSendMessage(req, res, supabase);
  } else {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }
};

/**
 * GET: Fetch messages for a conversation
 */
async function handleGetMessages(req, res, supabase) {
  try {
    const { conversationId, workspaceId, platform, refresh = 'false' } = req.query;

    if (!conversationId || !workspaceId || !platform) {
      return sendError(
        res,
        "conversationId, workspaceId, and platform are required",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(conversationId)) {
      return sendError(res, "Invalid conversationId format", ErrorCodes.VALIDATION_ERROR);
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No social accounts connected for this workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Get the local conversation record
    const { data: conversation, error: convError } = await supabase
      .from('inbox_conversations')
      .select('id, ayrshare_conversation_id, can_reply')
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .single();

    if (convError && convError.code !== 'PGRST116') {
      logError('inbox.messages.getConversation', convError, { conversationId });
    }

    if (!conversation) {
      return sendError(res, "Conversation not found", ErrorCodes.NOT_FOUND);
    }

    const ayrshareConversationId = conversation.ayrshare_conversation_id;

    // Fetch messages from Ayrshare if refresh requested
    if (refresh === 'true' && isServiceConfigured('ayrshare')) {
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
      logError('inbox.messages.fetch', msgError, { conversationId });
      return sendError(res, "Failed to fetch messages", ErrorCodes.DATABASE_ERROR);
    }

    return sendSuccess(res, {
      messages: messages || [],
      conversationId,
      canReply: conversation.can_reply
    });

  } catch (error) {
    logError('inbox.messages.get.handler', error);
    return sendError(res, "Failed to fetch messages", ErrorCodes.INTERNAL_ERROR);
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
      return sendError(
        res,
        "workspaceId, platform, conversationId, and message are required",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(conversationId)) {
      return sendError(res, "Invalid conversationId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate message length
    if (message.length > 2000) {
      return sendError(res, "Message exceeds maximum length of 2000 characters", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isServiceConfigured('ayrshare')) {
      return sendError(res, "Social media service is not configured", ErrorCodes.CONFIG_ERROR);
    }

    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(res, "No social accounts connected for this workspace", ErrorCodes.VALIDATION_ERROR);
    }

    // Get the conversation to check if we can reply and get Ayrshare conversation ID
    const { data: conversation, error: convError } = await supabase
      .from('inbox_conversations')
      .select('id, ayrshare_conversation_id, correspondent_id, can_reply')
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .single();

    if (convError && convError.code !== 'PGRST116') {
      logError('inbox.messages.send.getConversation', convError, { conversationId });
    }

    if (!conversation) {
      return sendError(res, "Conversation not found", ErrorCodes.NOT_FOUND);
    }

    if (!conversation.can_reply) {
      return sendError(
        res,
        "Cannot reply to this conversation. Instagram conversations expire after 7 days of inactivity.",
        ErrorCodes.VALIDATION_ERROR
      );
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
    let response;
    try {
      response = await axios.post(
        `${BASE_AYRSHARE}/messages/${platform}`,
        messagePayload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey
          },
          timeout: 30000
        }
      );
    } catch (axiosError) {
      logError('inbox.messages.send.ayrshare', axiosError, { platform, conversationId });
      return sendError(
        res,
        "Failed to send message",
        ErrorCodes.EXTERNAL_API_ERROR,
        axiosError.response?.data
      );
    }

    if (response.data.status === 'error') {
      return sendError(res, "Failed to send message", ErrorCodes.EXTERNAL_API_ERROR, response.data);
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
      logError('inbox.messages.send.save', saveError, { conversationId });
    }

    // Update conversation's last message
    const { error: updateError } = await supabase
      .from('inbox_conversations')
      .update({
        last_message_text: message,
        last_message_at: new Date().toISOString(),
        last_message_sender: 'user',
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (updateError) {
      logError('inbox.messages.send.updateConversation', updateError, { conversationId });
    }

    return sendSuccess(res, {
      message: savedMessage || sentMessage,
      ayrshareResponse: response.data
    });

  } catch (error) {
    logError('inbox.messages.post.handler', error);
    return sendError(res, "Failed to send message", ErrorCodes.INTERNAL_ERROR);
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
        },
        timeout: 30000
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
        logError('inbox.messages.sync.upsert', error, { messageId: msg.id });
      }
    }

    return ayrshareMessages.length;

  } catch (error) {
    logError('inbox.messages.sync', error);
    throw error;
  }
}
