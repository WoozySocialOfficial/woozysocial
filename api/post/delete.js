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
  parseBody
} = require("../_utils");

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

/**
 * DELETE /api/post/delete
 * Deletes a post from social media platforms via Ayrshare
 *
 * Body:
 * - postId: Required Ayrshare post ID
 * - workspaceId: Required workspace ID
 * - deleteFromDatabase: Optional, also delete from our database (default: true)
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "DELETE" && req.method !== "POST") {
    return sendError(res, "Method not allowed. Use DELETE or POST", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  try {
    const body = await parseBody(req);
    const { postId, workspaceId, deleteFromDatabase = true } = body;

    // Validate required fields
    if (!postId) {
      return sendError(res, "postId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!workspaceId) {
      return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get workspace profile key
    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return sendError(
        res,
        "No Ayrshare profile found for this workspace",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    console.log('[DELETE POST] Attempting to delete post:', { postId, workspaceId });

    // Delete from Ayrshare FIRST - this is the critical operation
    let ayrshareDeleted = false;
    let ayrshareError = null;

    try {
      const response = await axios.delete(
        `${BASE_AYRSHARE}/post/${postId}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey
          },
          timeout: 30000
        }
      );

      if (response.data && (response.data.status === 'success' || response.status === 200)) {
        ayrshareDeleted = true;
        console.log('[DELETE POST] Successfully deleted from Ayrshare:', response.data);
      } else {
        ayrshareError = response.data;
        console.warn('[DELETE POST] Unexpected Ayrshare response:', response.data);

        // Don't proceed with database delete if Ayrshare failed
        return sendError(
          res,
          "Failed to delete post from social media platforms",
          ErrorCodes.EXTERNAL_API_ERROR,
          {
            message: "Post could not be deleted from social media. Database was not modified.",
            ayrshareError: response.data
          }
        );
      }
    } catch (axiosError) {
      const statusCode = axiosError.response?.status;
      const responseData = axiosError.response?.data;

      console.error('[DELETE POST] Ayrshare delete failed:', {
        status: statusCode,
        data: responseData,
        message: axiosError.message
      });

      // 404 means post doesn't exist on Ayrshare (already deleted or never existed)
      // This is OK - we can still clean up our database
      if (statusCode === 404) {
        console.log('[DELETE POST] Post not found on Ayrshare (404 - may already be deleted), proceeding with database cleanup');
        ayrshareDeleted = true; // Treat as success for database cleanup
      } else {
        // Any other error - STOP and return error
        // Don't delete from database if we can't delete from social media
        return sendError(
          res,
          "Failed to delete post from social media platforms",
          ErrorCodes.EXTERNAL_API_ERROR,
          {
            message: "Post could not be deleted from social media. Please try again or delete manually from the platform. Database was not modified.",
            statusCode,
            ayrshareError: responseData || axiosError.message
          }
        );
      }
    }

    // Delete from database if requested
    const supabase = getSupabase();
    let databaseDeleted = false;
    let databaseError = null;

    if (deleteFromDatabase && supabase) {
      try {
        // Find the post in our database by ayr_post_id
        const { data: posts, error: findError } = await supabase
          .from('posts')
          .select('id')
          .eq('ayr_post_id', postId)
          .eq('workspace_id', workspaceId);

        if (findError) {
          console.error('[DELETE POST] Error finding post in database:', findError);
          databaseError = findError.message;
        } else if (posts && posts.length > 0) {
          // Delete the post
          const { error: deleteError } = await supabase
            .from('posts')
            .delete()
            .eq('ayr_post_id', postId)
            .eq('workspace_id', workspaceId);

          if (deleteError) {
            console.error('[DELETE POST] Error deleting from database:', deleteError);
            databaseError = deleteError.message;
          } else {
            databaseDeleted = true;
            console.log('[DELETE POST] Successfully deleted from database');
          }
        } else {
          console.log('[DELETE POST] Post not found in database (may have been draft-only or already deleted)');
          databaseDeleted = true; // Treat as success if not found
        }
      } catch (dbError) {
        console.error('[DELETE POST] Database operation exception:', dbError);
        databaseError = dbError.message;
      }
    }

    // Determine overall success
    const success = ayrshareDeleted && (!deleteFromDatabase || databaseDeleted);

    if (success) {
      return sendSuccess(res, {
        success: true,
        message: "Post deleted successfully",
        deletedFromAyrshare: ayrshareDeleted,
        deletedFromDatabase: databaseDeleted,
        postId
      });
    } else {
      // Partial failure - some operations failed
      return sendError(
        res,
        "Post deletion partially failed",
        ErrorCodes.EXTERNAL_API_ERROR,
        {
          ayrshareDeleted,
          ayrshareError,
          databaseDeleted,
          databaseError,
          message: "Some delete operations failed. See details for more information."
        }
      );
    }

  } catch (error) {
    logError('post.delete.handler', error);
    return sendError(
      res,
      "Failed to delete post",
      ErrorCodes.INTERNAL_ERROR,
      error.message
    );
  }
};
