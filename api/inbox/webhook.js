const {
  setCors,
  getSupabase,
  parseBody,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError
} = require("../_utils");

/**
 * Webhook Handler for Ayrshare Message Events
 *
 * POST /api/inbox/webhook
 * Receives real-time notifications from Ayrshare for:
 * - message_received: New incoming message
 * - message_read: Message read receipt
 * - message_reaction: Reaction to a message
 *
 * Setup: Register this endpoint with Ayrshare via POST /hook/webhook
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Ayrshare may send GET for webhook verification
  if (req.method === "GET") {
    const { challenge } = req.query;
    if (challenge) {
      return res.status(200).send(challenge);
    }
    return sendSuccess(res, { status: "Webhook endpoint active" });
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const body = await parseBody(req);
    const {
      event,
      type,
      platform,
      profileKey,
      conversationId,
      messageId,
      message,
      senderId,
      senderName,
      timestamp,
      data
    } = body;

    const eventType = event || type;

    // Log the webhook event
    const { data: webhookLog, error: logErr } = await supabase
      .from('inbox_webhook_events')
      .insert([{
        event_type: eventType,
        platform: platform || 'unknown',
        payload: body,
        processed: false
      }])
      .select()
      .single();

    if (logErr) {
      logError('inbox.webhook.log', logErr, { eventType });
    }

    // Find the workspace by profile key
    let workspaceId = null;
    if (profileKey) {
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('ayr_profile_key', profileKey)
        .single();

      workspaceId = workspace?.id;
    }

    // Process the event
    let processed = false;
    let errorMessage = null;

    try {
      switch (eventType) {
        case 'message':
        case 'message_received':
        case 'messages':
          await handleNewMessage(supabase, {
            workspaceId,
            platform,
            conversationId,
            messageId,
            message: message || data?.message,
            senderId: senderId || data?.senderId,
            senderName: senderName || data?.senderName,
            timestamp: timestamp || data?.timestamp
          });
          processed = true;
          break;

        case 'message_read':
        case 'read':
          await handleMessageRead(supabase, {
            workspaceId,
            platform,
            conversationId,
            messageId,
            timestamp
          });
          processed = true;
          break;

        case 'message_reaction':
        case 'reaction':
          // Log but don't process reactions for now
          logError('inbox.webhook.reaction', { message: 'Reaction received (not processed)' }, body);
          processed = true;
          break;

        default:
          logError('inbox.webhook.unknownEvent', { message: `Unknown event type: ${eventType}` }, body);
          errorMessage = `Unknown event type: ${eventType}`;
      }
    } catch (processError) {
      logError('inbox.webhook.process', processError, { eventType });
      errorMessage = processError.message;
    }

    // Update the webhook log with processing status
    if (webhookLog?.id) {
      const { error: updateErr } = await supabase
        .from('inbox_webhook_events')
        .update({
          processed,
          processed_at: processed ? new Date().toISOString() : null,
          error_message: errorMessage,
          workspace_id: workspaceId
        })
        .eq('id', webhookLog.id);

      if (updateErr) {
        logError('inbox.webhook.updateLog', updateErr, { webhookLogId: webhookLog.id });
      }
    }

    return sendSuccess(res, { processed });

  } catch (error) {
    logError('inbox.webhook.handler', error);
    return sendError(res, "Webhook processing failed", ErrorCodes.INTERNAL_ERROR);
  }
};

/**
 * Handle incoming message webhook
 */
async function handleNewMessage(supabase, {
  workspaceId,
  platform,
  conversationId,
  messageId,
  message,
  senderId,
  senderName,
  timestamp
}) {
  if (!workspaceId || !platform || !conversationId) {
    logError('inbox.webhook.newMessage.missingFields', { message: 'Missing required fields' }, { workspaceId, platform, conversationId });
    return;
  }

  // Find or create the conversation
  let { data: conversation } = await supabase
    .from('inbox_conversations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('platform', platform)
    .eq('ayrshare_conversation_id', conversationId)
    .single();

  // If conversation doesn't exist, create it
  if (!conversation) {
    const { data: newConv, error: createError } = await supabase
      .from('inbox_conversations')
      .insert([{
        workspace_id: workspaceId,
        platform,
        ayrshare_conversation_id: conversationId,
        correspondent_id: senderId,
        correspondent_name: senderName || 'Unknown',
        last_message_text: message?.text || message,
        last_message_at: timestamp || new Date().toISOString(),
        last_message_sender: 'correspondent',
        unread_count: 1
      }])
      .select()
      .single();

    if (createError) {
      logError('inbox.webhook.newMessage.createConversation', createError, { workspaceId, conversationId });
      return;
    }

    conversation = newConv;
  }

  // Insert the message
  const messageText = typeof message === 'string' ? message : message?.text || message?.content;

  const { error: msgError } = await supabase
    .from('inbox_messages')
    .insert([{
      conversation_id: conversation.id,
      ayrshare_message_id: messageId,
      sender_type: 'correspondent',
      sender_name: senderName || 'Contact',
      message_text: messageText,
      media_urls: message?.mediaUrls || [],
      sent_at: timestamp || new Date().toISOString(),
      metadata: { webhook: true, raw: message }
    }]);

  if (msgError && msgError.code !== '23505') { // Ignore duplicate
    logError('inbox.webhook.newMessage.insertMessage', msgError, { conversationId: conversation.id });
  }

  // The trigger will automatically update the conversation's last_message and unread_count
}

/**
 * Handle message read receipt
 */
async function handleMessageRead(supabase, {
  workspaceId,
  platform,
  conversationId,
  messageId,
  timestamp
}) {
  if (!conversationId) return;

  // Update message read status
  if (messageId) {
    const { error } = await supabase
      .from('inbox_messages')
      .update({ read_at: timestamp || new Date().toISOString() })
      .eq('ayrshare_message_id', messageId);

    if (error) {
      logError('inbox.webhook.messageRead.update', error, { messageId });
    }
  }
}
