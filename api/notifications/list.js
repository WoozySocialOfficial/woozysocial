const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID
} = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabase = getSupabase();

  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  // GET - Fetch notifications
  if (req.method === "GET") {
    try {
      const { userId, workspaceId, unreadOnly } = req.query;

      console.log('[notifications.list] GET request:', { userId, workspaceId, unreadOnly });

      if (!userId) {
        return sendError(res, "userId is required", ErrorCodes.VALIDATION_ERROR);
      }

      if (!isValidUUID(userId)) {
        return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
      }

      if (workspaceId && !isValidUUID(workspaceId)) {
        return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
      }

      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      if (unreadOnly === 'true') {
        query = query.eq('read', false);
      }

      console.log('[notifications.list] Executing query...');
      const { data: notifications, error } = await query;
      console.log('[notifications.list] Query result:', { count: notifications?.length || 0, error: error?.message || null });

      if (error) {
        // Table might not exist yet - return empty gracefully
        logError('notifications.list.fetch', error, { userId });
        return sendSuccess(res, { notifications: [], unreadCount: 0 });
      }

      const unreadCount = notifications?.filter(n => !n.read).length || 0;

      return sendSuccess(res, {
        notifications: notifications || [],
        unreadCount
      });

    } catch (error) {
      logError('notifications.list.get.handler', error);
      return sendError(res, "Failed to fetch notifications", ErrorCodes.INTERNAL_ERROR);
    }
  }

  // POST - Mark notifications as read
  else if (req.method === "POST") {
    try {
      const { userId, notificationIds, markAllRead } = req.body;

      if (!userId) {
        return sendError(res, "userId is required", ErrorCodes.VALIDATION_ERROR);
      }

      if (!isValidUUID(userId)) {
        return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
      }

      if (markAllRead) {
        // Mark all notifications as read for this user
        const { error } = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', userId)
          .eq('read', false);

        if (error) {
          logError('notifications.list.markAllRead', error, { userId });
          return sendError(res, "Failed to mark notifications as read", ErrorCodes.DATABASE_ERROR);
        }

        return sendSuccess(res, { message: "All notifications marked as read" });
      }

      if (notificationIds && notificationIds.length > 0) {
        // Validate all notification IDs are UUIDs
        for (const id of notificationIds) {
          if (!isValidUUID(id)) {
            return sendError(res, "Invalid notification ID format", ErrorCodes.VALIDATION_ERROR);
          }
        }

        // Mark specific notifications as read
        const { error } = await supabase
          .from('notifications')
          .update({ read: true })
          .in('id', notificationIds)
          .eq('user_id', userId);

        if (error) {
          logError('notifications.list.markRead', error, { userId });
          return sendError(res, "Failed to update notifications", ErrorCodes.DATABASE_ERROR);
        }

        return sendSuccess(res, { message: "Notifications marked as read" });
      }

      return sendError(res, "notificationIds or markAllRead is required", ErrorCodes.VALIDATION_ERROR);

    } catch (error) {
      logError('notifications.list.post.handler', error);
      return sendError(res, "Failed to update notifications", ErrorCodes.INTERNAL_ERROR);
    }
  }

  else {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }
};
