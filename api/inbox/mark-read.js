const {
  setCors,
  getSupabase,
  parseBody,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../_utils");

/**
 * Mark Conversation as Read
 *
 * PUT /api/inbox/mark-read
 * Body: { conversationId, userId }
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "PUT" && req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const body = await parseBody(req);
    const { conversationId, userId } = body;

    if (!conversationId || !userId) {
      return sendError(res, "conversationId and userId are required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(conversationId)) {
      return sendError(res, "Invalid conversationId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Update read status using the database function
    const { error } = await supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_user_id: userId
    });

    if (error) {
      // Fallback if function doesn't exist
      const { error: updateError } = await supabase
        .from('inbox_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (updateError) {
        logError('inbox.mark-read.updateConversation', updateError, { conversationId });
      }

      const { error: upsertError } = await supabase
        .from('inbox_read_status')
        .upsert({
          user_id: userId,
          conversation_id: conversationId,
          last_read_at: new Date().toISOString()
        }, { onConflict: 'user_id,conversation_id' });

      if (upsertError) {
        logError('inbox.mark-read.upsertStatus', upsertError, { conversationId, userId });
      }
    }

    return sendSuccess(res, { message: "Conversation marked as read" });

  } catch (error) {
    logError('inbox.mark-read.handler', error);
    return sendError(res, "Failed to mark conversation as read", ErrorCodes.INTERNAL_ERROR);
  }
};
