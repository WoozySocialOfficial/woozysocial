const { setCors, getSupabase, parseBody } = require("../_utils");

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
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Database connection not available" });
  }

  try {
    const body = await parseBody(req);
    const { conversationId, userId } = body;

    if (!conversationId || !userId) {
      return res.status(400).json({ error: "conversationId and userId are required" });
    }

    // Update read status using the database function
    const { error } = await supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_user_id: userId
    });

    if (error) {
      // Fallback if function doesn't exist
      await supabase
        .from('inbox_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      await supabase
        .from('inbox_read_status')
        .upsert({
          user_id: userId,
          conversation_id: conversationId,
          last_read_at: new Date().toISOString()
        }, { onConflict: 'user_id,conversation_id' });
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error("Error marking conversation as read:", error);
    res.status(500).json({
      error: "Failed to mark conversation as read",
      details: error.message
    });
  }
};
