const {
  setCors,
  getSupabase,
  parseBody,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidUUID
} = require("../_utils");
const { sendNewCommentNotification, sendMentionNotifications } = require("../notifications/helpers");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  // POST - Add a comment
  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { postId, workspaceId, userId, comment, priority = 'normal', mentions = [] } = body;

      // Validate required fields
      const validation = validateRequired(body, ['postId', 'workspaceId', 'userId', 'comment']);
      if (!validation.valid) {
        return sendError(
          res,
          `Missing required fields: ${validation.missing.join(', ')}`,
          ErrorCodes.VALIDATION_ERROR
        );
      }

      if (!isValidUUID(postId) || !isValidUUID(workspaceId) || !isValidUUID(userId)) {
        return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
      }

      // Validate priority
      if (!['normal', 'high', 'urgent'].includes(priority)) {
        return sendError(res, "Invalid priority value. Must be: normal, high, or urgent", ErrorCodes.VALIDATION_ERROR);
      }

      // Validate mentions is an array of valid UUIDs
      if (!Array.isArray(mentions)) {
        return sendError(res, "Mentions must be an array", ErrorCodes.VALIDATION_ERROR);
      }

      if (mentions.length > 0 && !mentions.every(id => isValidUUID(id))) {
        return sendError(res, "Invalid mention ID format", ErrorCodes.VALIDATION_ERROR);
      }

      // Validate comment length
      if (comment.length > 2000) {
        return sendError(res, "Comment exceeds maximum length of 2000 characters", ErrorCodes.VALIDATION_ERROR);
      }

      // Verify user is a member of the workspace
      const { data: membership, error: membershipError } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single();

      if (membershipError && membershipError.code !== 'PGRST116') {
        logError('post.comment.checkMembership', membershipError, { userId, workspaceId });
      }

      if (!membership) {
        return sendError(res, "You are not a member of this workspace", ErrorCodes.FORBIDDEN);
      }

      // Create the comment
      const { data: newComment, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          workspace_id: workspaceId,
          user_id: userId,
          comment: comment,
          priority: priority,
          mentions: mentions,
          is_system: false
        })
        .select(`
          id,
          comment,
          priority,
          mentions,
          is_system,
          created_at,
          user_id
        `)
        .single();

      if (error) {
        logError('post.comment.create', error, { postId, userId });
        return sendError(res, "Failed to create comment", ErrorCodes.DATABASE_ERROR);
      }

      // Get user info
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('full_name, email, avatar_url')
        .eq('id', userId)
        .single();

      // Send notification to post creator and other commenters (non-blocking)
      const commenterName = userProfile?.full_name || userProfile?.email || 'Someone';
      sendNewCommentNotification(supabase, {
        postId,
        workspaceId,
        commenterId: userId,
        commenterName,
        comment
      });

      // Send mention notifications if there are mentions (non-blocking)
      if (mentions && mentions.length > 0) {
        sendMentionNotifications(supabase, {
          postId,
          workspaceId,
          commentId: newComment.id,
          mentionerId: userId,
          mentionerName: commenterName,
          mentionedUserIds: mentions,
          comment
        });
      }

      return sendSuccess(res, {
        comment: {
          ...newComment,
          user_profiles: userProfile
        }
      });

    } catch (error) {
      logError('post.comment.post.handler', error);
      return sendError(res, "Failed to create comment", ErrorCodes.INTERNAL_ERROR);
    }
  }

  // GET - Get comments for a post
  else if (req.method === "GET") {
    try {
      const { postId, workspaceId, userId } = req.query;

      if (!postId) {
        return sendError(res, "postId is required", ErrorCodes.VALIDATION_ERROR);
      }

      if (!isValidUUID(postId)) {
        return sendError(res, "Invalid postId format", ErrorCodes.VALIDATION_ERROR);
      }

      // Verify user is a member if workspaceId provided
      if (workspaceId && userId) {
        if (!isValidUUID(workspaceId) || !isValidUUID(userId)) {
          return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
        }

        const { data: membership, error: membershipError } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', workspaceId)
          .eq('user_id', userId)
          .single();

        if (membershipError && membershipError.code !== 'PGRST116') {
          logError('post.comment.get.checkMembership', membershipError, { userId, workspaceId });
        }

        if (!membership) {
          return sendError(res, "You are not a member of this workspace", ErrorCodes.FORBIDDEN);
        }
      }

      const { data: comments, error } = await supabase
        .from('post_comments')
        .select(`
          id,
          comment,
          priority,
          mentions,
          is_system,
          created_at,
          updated_at,
          user_id,
          user_profiles (
            full_name,
            email,
            avatar_url
          )
        `)
        .eq('post_id', postId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) {
        logError('post.comment.list', error, { postId });
        return sendError(res, "Failed to fetch comments", ErrorCodes.DATABASE_ERROR);
      }

      return sendSuccess(res, { comments: comments || [] });

    } catch (error) {
      logError('post.comment.get.handler', error);
      return sendError(res, "Failed to fetch comments", ErrorCodes.INTERNAL_ERROR);
    }
  }

  // PUT - Update a comment
  else if (req.method === "PUT") {
    try {
      const body = await parseBody(req);
      const { commentId, userId, comment, priority, mentions } = body;

      // Validate required fields
      const validation = validateRequired(body, ['commentId', 'userId', 'comment']);
      if (!validation.valid) {
        return sendError(
          res,
          `Missing required fields: ${validation.missing.join(', ')}`,
          ErrorCodes.VALIDATION_ERROR
        );
      }

      if (!isValidUUID(commentId) || !isValidUUID(userId)) {
        return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
      }

      // Validate comment length
      if (comment.length > 2000) {
        return sendError(res, "Comment exceeds maximum length of 2000 characters", ErrorCodes.VALIDATION_ERROR);
      }

      // Verify user owns the comment
      const { data: existingComment, error: fetchError } = await supabase
        .from('post_comments')
        .select('user_id')
        .eq('id', commentId)
        .single();

      if (fetchError || !existingComment) {
        return sendError(res, "Comment not found", ErrorCodes.NOT_FOUND);
      }

      if (existingComment.user_id !== userId) {
        return sendError(res, "You can only edit your own comments", ErrorCodes.FORBIDDEN);
      }

      // Build update object
      const updateData = {
        comment: comment,
        updated_at: new Date().toISOString()
      };

      // Only update priority if provided and valid
      if (priority && ['normal', 'high', 'urgent'].includes(priority)) {
        updateData.priority = priority;
      }

      // Only update mentions if provided and valid
      if (Array.isArray(mentions)) {
        if (mentions.length === 0 || mentions.every(id => isValidUUID(id))) {
          updateData.mentions = mentions;
        } else {
          return sendError(res, "Invalid mention ID format", ErrorCodes.VALIDATION_ERROR);
        }
      }

      const { data: updatedComment, error } = await supabase
        .from('post_comments')
        .update(updateData)
        .eq('id', commentId)
        .select()
        .single();

      if (error) {
        logError('post.comment.update', error, { commentId });
        return sendError(res, "Failed to update comment", ErrorCodes.DATABASE_ERROR);
      }

      return sendSuccess(res, { comment: updatedComment });

    } catch (error) {
      logError('post.comment.put.handler', error);
      return sendError(res, "Failed to update comment", ErrorCodes.INTERNAL_ERROR);
    }
  }

  // DELETE - Delete a comment
  else if (req.method === "DELETE") {
    try {
      const { commentId, userId } = req.query;

      if (!commentId || !userId) {
        return sendError(res, "commentId and userId are required", ErrorCodes.VALIDATION_ERROR);
      }

      if (!isValidUUID(commentId) || !isValidUUID(userId)) {
        return sendError(res, "Invalid ID format", ErrorCodes.VALIDATION_ERROR);
      }

      // Verify user owns the comment
      const { data: existingComment, error: fetchError } = await supabase
        .from('post_comments')
        .select('user_id')
        .eq('id', commentId)
        .single();

      if (fetchError || !existingComment) {
        return sendError(res, "Comment not found", ErrorCodes.NOT_FOUND);
      }

      if (existingComment.user_id !== userId) {
        return sendError(res, "You can only delete your own comments", ErrorCodes.FORBIDDEN);
      }

      const { error } = await supabase
        .from('post_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        logError('post.comment.delete', error, { commentId });
        return sendError(res, "Failed to delete comment", ErrorCodes.DATABASE_ERROR);
      }

      return sendSuccess(res, { message: "Comment deleted successfully" });

    } catch (error) {
      logError('post.comment.delete.handler', error);
      return sendError(res, "Failed to delete comment", ErrorCodes.INTERNAL_ERROR);
    }
  }

  else {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }
};
