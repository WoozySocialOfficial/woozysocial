const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  validateRequired,
  isValidUUID,
  isValidEmail,
  applyRateLimit
} = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  // Rate limiting: 3 deactivation attempts per hour
  const rateLimited = applyRateLimit(req, res, 'account-deactivate', { maxRequests: 3, windowMs: 3600000 });
  if (rateLimited) return;

  const supabase = getSupabase();

  if (!supabase) {
    return sendError(res, "Database service is not available", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { userId, confirmEmail } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, ['userId', 'confirmEmail']);
    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidEmail(confirmEmail)) {
      return sendError(res, "Invalid email format", ErrorCodes.VALIDATION_ERROR);
    }

    // Get user's email to verify confirmation
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return sendError(res, "User not found", ErrorCodes.NOT_FOUND);
    }

    // Verify email confirmation matches
    if (profile.email.toLowerCase() !== confirmEmail.toLowerCase()) {
      return sendError(res, "Email confirmation does not match", ErrorCodes.VALIDATION_ERROR);
    }

    // Check if user owns any workspaces - they must transfer ownership first
    const { data: ownedWorkspaces, error: workspacesError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('role', 'owner');

    if (workspacesError) {
      logError('account.deactivate.checkWorkspaces', workspacesError, { userId });
    }

    if (ownedWorkspaces && ownedWorkspaces.length > 0) {
      return sendError(
        res,
        "You must transfer ownership of your workspaces before deactivating your account",
        ErrorCodes.VALIDATION_ERROR,
        { workspaceCount: ownedWorkspaces.length }
      );
    }

    // Remove user from all workspaces
    const { error: removeError } = await supabase
      .from('workspace_members')
      .delete()
      .eq('user_id', userId);

    if (removeError) {
      logError('account.deactivate.removeWorkspaces', removeError, { userId });
    }

    // Cancel any pending invitations sent by this user
    const { error: inviteError } = await supabase
      .from('workspace_invitations')
      .update({ status: 'cancelled' })
      .eq('invited_by', userId)
      .eq('status', 'pending');

    if (inviteError) {
      logError('account.deactivate.cancelInvites', inviteError, { userId });
    }

    // Mark user profile as deactivated
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        deactivated_at: new Date().toISOString(),
        full_name: '[Deactivated User]'
      })
      .eq('id', userId);

    if (updateError) {
      logError('account.deactivate.updateProfile', updateError, { userId });
      return sendError(res, "Failed to deactivate account", ErrorCodes.DATABASE_ERROR);
    }

    // Delete the auth user (this will sign them out everywhere)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      logError('account.deactivate.deleteAuth', deleteError, { userId });
      // Profile is already marked as deactivated, so this is semi-successful
    }

    return sendSuccess(res, { message: "Account deactivated successfully" });

  } catch (error) {
    logError('account.deactivate.handler', error);
    return sendError(res, "Failed to deactivate account", ErrorCodes.INTERNAL_ERROR);
  }
};
