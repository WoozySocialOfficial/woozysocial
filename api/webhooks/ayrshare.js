const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  parseBody
} = require("../_utils");

/**
 * Ayrshare Webhook Handler
 * Receives webhooks from Ayrshare for:
 * - New comments on posts
 * - New messages/DMs
 * - Post analytics updates
 *
 * Ayrshare Webhook Documentation:
 * https://docs.ayrshare.com/rest-api/webhooks
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed. Webhooks must use POST", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const payload = await parseBody(req);

    console.log('[WEBHOOK] Received Ayrshare webhook:', {
      type: payload.type,
      action: payload.action,
      platform: payload.platform,
      timestamp: new Date().toISOString()
    });

    // Store raw webhook event for debugging
    await supabase.from('inbox_webhook_events').insert({
      event_type: payload.type || payload.action,
      platform: payload.platform,
      payload: payload,
      processed: false,
      created_at: new Date().toISOString()
    });

    // Handle different webhook types
    switch (payload.type || payload.action) {
      case 'comment':
      case 'new_comment':
        await handleComment(payload, supabase);
        break;

      case 'message':
      case 'new_message':
      case 'direct_message':
        await handleMessage(payload, supabase);
        break;

      case 'post_analytics':
      case 'analytics':
        await handleAnalytics(payload, supabase);
        break;

      default:
        console.log('[WEBHOOK] Unknown webhook type:', payload.type || payload.action);
    }

    return sendSuccess(res, {
      received: true,
      type: payload.type || payload.action
    });

  } catch (error) {
    logError('webhook.ayrshare', error);

    // Still return 200 to Ayrshare so they don't retry
    // But log the error for debugging
    return sendSuccess(res, {
      received: true,
      error: error.message
    });
  }
};

async function handleComment(payload, supabase) {
  console.log('[WEBHOOK] Processing comment:', {
    platform: payload.platform,
    postId: payload.postId,
    commentId: payload.commentId || payload.id
  });

  const {
    postId,
    platform,
    commentId,
    id,
    text,
    message,
    username,
    user,
    timestamp,
    created_at
  } = payload;

  // Find the post in our database
  const { data: post } = await supabase
    .from('posts')
    .select('id, workspace_id')
    .eq('ayr_post_id', postId)
    .single();

  if (!post) {
    console.warn('[WEBHOOK] Post not found for comment:', postId);
    return;
  }

  // Insert engagement comment from social media follower
  const { error: commentError } = await supabase
    .from('social_engagement_comments')
    .insert({
      post_id: post.id,
      workspace_id: post.workspace_id,
      platform: platform,
      external_id: commentId || id,
      comment_text: text || message,
      author_username: username || user?.username || user?.name,
      author_profile_url: user?.profile_url || user?.url,
      created_at: timestamp || created_at || new Date().toISOString()
    });

  if (commentError && commentError.code !== '23505') { // Ignore duplicates
    console.error('[WEBHOOK] Error saving comment:', commentError);
    logError('webhook.comment', commentError, { postId, platform });
  } else {
    console.log('[WEBHOOK] Comment saved successfully');
  }

  // Mark webhook as processed
  await supabase
    .from('inbox_webhook_events')
    .update({ processed: true })
    .eq('payload->>commentId', commentId || id)
    .eq('platform', platform);
}

async function handleMessage(payload, supabase) {
  console.log('[WEBHOOK] Processing message:', {
    platform: payload.platform,
    messageId: payload.messageId || payload.id,
    from: payload.from || payload.sender
  });

  const {
    platform,
    messageId,
    id,
    text,
    message,
    from,
    sender,
    to,
    recipient,
    timestamp,
    created_at,
    conversationId,
    threadId
  } = payload;

  // Create or find conversation
  const conversationExternalId = conversationId || threadId || `${platform}_${from || sender}`;

  let conversation;
  const { data: existingConv } = await supabase
    .from('inbox_conversations')
    .select('id')
    .eq('external_id', conversationExternalId)
    .eq('platform', platform)
    .single();

  if (existingConv) {
    conversation = existingConv;

    // Update last message time
    await supabase
      .from('inbox_conversations')
      .update({
        last_message_at: timestamp || created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', existingConv.id);
  } else {
    // Find workspace_id from the payload or first available workspace
    // TODO: Map platform account to workspace_id properly
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1)
      .single();

    const workspaceId = workspaces?.id;

    if (!workspaceId) {
      console.error('[WEBHOOK] No workspace found for conversation');
      return;
    }

    // Create new conversation
    const { data: newConv, error: convError } = await supabase
      .from('inbox_conversations')
      .insert({
        workspace_id: workspaceId,
        external_id: conversationExternalId,
        platform: platform,
        participant_username: from || sender,
        last_message_at: timestamp || created_at || new Date().toISOString()
      })
      .select('id')
      .single();

    if (convError) {
      console.error('[WEBHOOK] Error creating conversation:', convError);
      return;
    }

    conversation = newConv;
  }

  // Insert message
  const { error: messageError } = await supabase
    .from('inbox_messages')
    .insert({
      conversation_id: conversation.id,
      external_id: messageId || id,
      platform: platform,
      message_text: text || message,
      sender_username: from || sender,
      recipient_username: to || recipient,
      is_from_user: false, // Message is coming TO us
      created_at: timestamp || created_at || new Date().toISOString()
    });

  if (messageError && messageError.code !== '23505') { // Ignore duplicates
    console.error('[WEBHOOK] Error saving message:', messageError);
    logError('webhook.message', messageError, { platform, messageId });
  } else {
    console.log('[WEBHOOK] Message saved successfully');
  }

  // Mark webhook as processed
  await supabase
    .from('inbox_webhook_events')
    .update({ processed: true })
    .eq('payload->>messageId', messageId || id)
    .eq('platform', platform);
}

async function handleAnalytics(payload, supabase) {
  console.log('[WEBHOOK] Processing analytics:', {
    platform: payload.platform,
    postId: payload.postId
  });

  const { postId, analytics } = payload;

  // Find the post
  const { data: post } = await supabase
    .from('posts')
    .select('id')
    .eq('ayr_post_id', postId)
    .single();

  if (!post) {
    console.warn('[WEBHOOK] Post not found for analytics:', postId);
    return;
  }

  // Update post with analytics data
  const { error: updateError } = await supabase
    .from('posts')
    .update({
      analytics: analytics,
      analytics_updated_at: new Date().toISOString()
    })
    .eq('id', post.id);

  if (updateError) {
    console.error('[WEBHOOK] Error updating analytics:', updateError);
    logError('webhook.analytics', updateError, { postId });
  } else {
    console.log('[WEBHOOK] Analytics updated successfully');
  }

  // Mark webhook as processed
  await supabase
    .from('inbox_webhook_events')
    .update({ processed: true })
    .eq('payload->>postId', postId)
    .eq('event_type', 'analytics');
}
