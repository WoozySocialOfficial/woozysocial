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

    // Resolve workspace from the profileKey in the payload.
    // Ayrshare includes profileKey on every webhook so we can route to the right workspace.
    const payloadProfileKey = payload.profileKey || payload.profile_key || payload.profile;
    let workspaceId = null;

    if (payloadProfileKey) {
      const { data: ws } = await supabase
        .from('workspaces')
        .select('id')
        .eq('ayr_profile_key', payloadProfileKey)
        .single();
      workspaceId = ws?.id;
    }

    // Fall back to first workspace if no profile key was provided in the payload
    if (!workspaceId) {
      const { data: ws } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .single();
      workspaceId = ws?.id;
    }

    // Store raw webhook event for debugging
    await supabase.from('inbox_webhook_events').insert({
      workspace_id: workspaceId,
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
        await handleComment(payload, supabase, workspaceId);
        break;

      case 'message':
      case 'new_message':
      case 'direct_message':
        await handleMessage(payload, supabase, workspaceId);
        break;

      case 'post_analytics':
      case 'analytics':
        await handleAnalytics(payload, supabase);
        break;

      // Ayrshare fires this when a user disconnects a social account from their profile.
      // Payload includes: platform, profileKey
      case 'social_disconnected':
      case 'unlink':
      case 'disconnect':
        await handleSocialDisconnected(payload, supabase, workspaceId);
        break;

      // Ayrshare fires this when a profile is deleted (e.g. from their dashboard).
      // We null out the stored key so the scheduler skips the workspace cleanly.
      case 'profile_deleted':
      case 'delete_profile':
        await handleProfileDeleted(payload, supabase, workspaceId, payloadProfileKey);
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

async function handleComment(payload, supabase, workspaceId) {
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
    .update({
      processed: true,
      processed_at: new Date().toISOString()
    })
    .eq('payload->>commentId', commentId || id)
    .eq('platform', platform);
}

async function handleMessage(payload, supabase, workspaceId) {
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

  if (!workspaceId) {
    console.error('[WEBHOOK] No workspace found for message');
    return;
  }

  // Create or find conversation using ayrshare_conversation_id
  const ayrshareConversationId = conversationId || threadId || `${platform}_${from || sender}`;

  let conversation;
  const { data: existingConv } = await supabase
    .from('inbox_conversations')
    .select('id')
    .eq('ayrshare_conversation_id', ayrshareConversationId)
    .eq('platform', platform)
    .eq('workspace_id', workspaceId)
    .single();

  if (existingConv) {
    conversation = existingConv;

    // Update last message info (unread_count will be updated by trigger)
    await supabase
      .from('inbox_conversations')
      .update({
        last_message_text: text || message,
        last_message_at: timestamp || created_at || new Date().toISOString(),
        last_message_sender: from || sender,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingConv.id);
  } else {
    // Create new conversation
    const { data: newConv, error: convError } = await supabase
      .from('inbox_conversations')
      .insert({
        workspace_id: workspaceId,
        platform: platform,
        ayrshare_conversation_id: ayrshareConversationId,
        correspondent_username: from || sender,
        correspondent_name: from || sender,
        last_message_text: text || message,
        last_message_at: timestamp || created_at || new Date().toISOString(),
        last_message_sender: from || sender,
        unread_count: 1
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
      ayrshare_message_id: messageId || id,
      platform_message_id: messageId || id,
      sender_type: 'correspondent', // Message from follower/customer TO us
      sender_name: from || sender,
      message_text: text || message,
      sent_at: timestamp || created_at || new Date().toISOString()
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
    .update({
      processed: true,
      processed_at: new Date().toISOString()
    })
    .eq('payload->>messageId', messageId || id)
    .eq('platform', platform);
}

// Called when a social account is disconnected from an Ayrshare profile
// (e.g. the user disconnects directly in the Ayrshare dashboard).
// We just log it — the workspace's connected platforms will update naturally
// when the user next visits their settings. No DB change needed beyond logging.
async function handleSocialDisconnected(payload, supabase, workspaceId) {
  console.log('[WEBHOOK] Social account disconnected:', {
    platform: payload.platform,
    workspaceId
  });

  if (!workspaceId) {
    console.warn('[WEBHOOK] handleSocialDisconnected: no workspace resolved from profileKey');
    return;
  }

  // Mark the webhook as processed — the scheduler will naturally stop sending
  // to this platform once Ayrshare stops including it in history.
  await supabase
    .from('inbox_webhook_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('event_type', payload.type || payload.action)
    .eq('platform', payload.platform);
}

// Called when an Ayrshare profile is deleted (from the dashboard or externally).
// We null out the stored keys so the scheduler skips this workspace cleanly.
async function handleProfileDeleted(payload, supabase, workspaceId, profileKey) {
  console.log('[WEBHOOK] Ayrshare profile deleted:', { workspaceId, profileKey });

  if (!workspaceId && !profileKey) {
    console.warn('[WEBHOOK] handleProfileDeleted: no workspace or profileKey to act on');
    return;
  }

  // Use workspaceId if we have it; otherwise find by profileKey directly.
  const query = workspaceId
    ? supabase.from('workspaces').update({ ayr_profile_key: null, ayr_ref_id: null, updated_at: new Date().toISOString() }).eq('id', workspaceId)
    : supabase.from('workspaces').update({ ayr_profile_key: null, ayr_ref_id: null, updated_at: new Date().toISOString() }).eq('ayr_profile_key', profileKey);

  const { error } = await query;
  if (error) {
    console.error('[WEBHOOK] Failed to nullify profile key after deletion:', error);
    logError('webhook.profileDeleted', error, { workspaceId, profileKey });
  } else {
    console.log('[WEBHOOK] Profile key nullified — scheduler will skip this workspace going forward');
  }
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
    .update({
      processed: true,
      processed_at: new Date().toISOString()
    })
    .eq('payload->>postId', postId)
    .eq('event_type', 'analytics');
}
