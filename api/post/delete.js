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
  parseBody,
  invalidateWorkspaceCache
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
    let { postId, databaseId, workspaceId, deleteFromDatabase = true } = body;

    // Validate required fields - need at least one identifier
    if (!postId && !databaseId) {
      return sendError(res, "postId or databaseId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!workspaceId) {
      return sendError(res, "workspaceId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    // If we have a databaseId but no Ayrshare postId, look it up from the database
    const supabase = getSupabase();
    if (!postId && databaseId && supabase) {
      const { data: dbPost } = await supabase
        .from('posts')
        .select('ayr_post_id')
        .eq('id', databaseId)
        .eq('workspace_id', workspaceId)
        .single();

      if (dbPost?.ayr_post_id) {
        postId = dbPost.ayr_post_id;
      }
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

    console.log('[DELETE POST] Attempting to delete post:', { postId, databaseId, workspaceId });

    // Delete from Ayrshare if we have an Ayrshare post ID
    let ayrshareDeleted = false;
    let ayrshareError = null;

    if (postId) {
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
        if (statusCode === 404) {
          console.log('[DELETE POST] Post not found on Ayrshare (404 - may already be deleted), proceeding with database cleanup');
          ayrshareDeleted = true;
        } else {
          ayrshareError = responseData || axiosError.message;
          // Don't block database deletion if Ayrshare fails - still clean up our DB
          console.warn('[DELETE POST] Ayrshare deletion failed, will still attempt database cleanup');
        }
      }
    } else {
      // No Ayrshare ID - post was never published (scheduled/pending), skip Ayrshare deletion
      console.log('[DELETE POST] No Ayrshare post ID - skipping Ayrshare deletion');
      ayrshareDeleted = true;
    }

    // Delete from database
    let databaseDeleted = false;
    let databaseError = null;

    if (deleteFromDatabase && supabase) {
      try {
        // Delete by database ID (preferred) or fall back to ayr_post_id
        let deleteQuery = supabase.from('posts').delete().eq('workspace_id', workspaceId);

        if (databaseId) {
          deleteQuery = deleteQuery.eq('id', databaseId);
        } else if (postId) {
          deleteQuery = deleteQuery.eq('ayr_post_id', postId);
        }

        const { error: deleteError, count } = await deleteQuery;

        if (deleteError) {
          console.error('[DELETE POST] Error deleting from database:', deleteError);
          databaseError = deleteError.message;
        } else {
          databaseDeleted = true;
          console.log('[DELETE POST] Successfully deleted from database');
        }
      } catch (dbError) {
        console.error('[DELETE POST] Database operation exception:', dbError);
        databaseError = dbError.message;
      }
    }

    // Determine overall success
    const success = ayrshareDeleted && (!deleteFromDatabase || databaseDeleted);

    if (success) {
      // Invalidate cache after successful deletion
      await invalidateWorkspaceCache(workspaceId);
      console.log('[DELETE POST] Cache invalidated for workspace:', workspaceId);

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
