const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  validateRequired,
  isValidEmail,
  logError
} = require("../_utils");

/**
 * Create a new user account and workspace (pending payment)
 * Used by marketing site during sign-up flow
 * POST /api/signup/create-account
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(
      res,
      "Method not allowed",
      ErrorCodes.METHOD_NOT_ALLOWED
    );
  }

  // Verify API key for security
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    return sendError(
      res,
      "Unauthorized",
      ErrorCodes.AUTH_INVALID
    );
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error("[CREATE ACCOUNT] Supabase client is null - check env vars");
    console.error("[CREATE ACCOUNT] SUPABASE_URL exists:", !!process.env.SUPABASE_URL);
    console.error("[CREATE ACCOUNT] SUPABASE_SERVICE_ROLE_KEY exists:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    return sendError(
      res,
      "Database not configured",
      ErrorCodes.CONFIG_ERROR
    );
  }

  console.log("[CREATE ACCOUNT] Supabase client initialized successfully");

  try {
    const {
      fullName,
      email,
      password,
      workspaceName,
      questionnaireAnswers,
      selectedTier
    } = req.body;

    // Validate required fields
    const validation = validateRequired(req.body, [
      "fullName",
      "email",
      "password",
      "workspaceName",
      "selectedTier"
    ]);

    if (!validation.valid) {
      return sendError(
        res,
        `Missing required fields: ${validation.missing.join(", ")}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return sendError(
        res,
        "Invalid email format",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate password length
    if (password.length < 8) {
      return sendError(
        res,
        "Password must be at least 8 characters",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    console.log("[CREATE ACCOUNT] Starting account creation for:", email);

    // Check if user already exists in user_profiles (from previous partial signup)
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id, email, onboarding_completed')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      console.log("[CREATE ACCOUNT] User already exists:", existingProfile.id);

      // If onboarding is already completed, they should login instead
      if (existingProfile.onboarding_completed) {
        return sendError(
          res,
          "Account already exists. Please login instead.",
          ErrorCodes.VALIDATION_ERROR
        );
      }

      // User exists but didn't complete payment - check if auth user still exists
      const { data: authUser } = await supabase.auth.admin.getUserById(existingProfile.id);

      if (authUser?.user) {
        // Auth user exists, check for workspace
        const { data: existingWorkspace } = await supabase
          .from('workspaces')
          .select('id')
          .eq('owner_id', existingProfile.id)
          .maybeSingle();

        if (existingWorkspace) {
          console.log("[CREATE ACCOUNT] Returning existing account for retry");
          return sendSuccess(res, {
            userId: existingProfile.id,
            workspaceId: existingWorkspace.id,
            message: "Account already exists, continuing signup"
          });
        }
      } else {
        // Auth user was deleted but profile remains - clean up orphaned profile
        console.log("[CREATE ACCOUNT] Cleaning up orphaned profile:", existingProfile.id);
        await supabase.from('user_profiles').delete().eq('id', existingProfile.id);
        // Continue with fresh signup below
      }
    }

    // STEP 1: Create Supabase auth user
    console.log("[CREATE ACCOUNT] About to call supabase.auth.admin.createUser");
    console.log("[CREATE ACCOUNT] Email:", email.toLowerCase());

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password: password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName
      }
    });

    if (authError) {
      console.error("[CREATE ACCOUNT] Auth error details:", {
        name: authError.name,
        message: authError.message,
        status: authError.status,
        code: authError.code,
        stack: authError.stack
      });

      logError("create-account-auth", authError, { email });

      // Handle specific auth errors
      if (authError.message?.includes("already registered")) {
        return sendError(
          res,
          "Email already registered",
          ErrorCodes.VALIDATION_ERROR
        );
      }

      return sendError(
        res,
        authError.message || "Failed to create account",
        ErrorCodes.INTERNAL_ERROR
      );
    }

    const userId = authData.user.id;
    console.log("[CREATE ACCOUNT] Auth user created:", userId);

    // STEP 2: Create user profile (use upsert to handle duplicates)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        email: email.toLowerCase(),
        full_name: fullName,
        questionnaire_answers: questionnaireAnswers || {},
        onboarding_step: 4, // At payment step
        onboarding_completed: false
      }, {
        onConflict: 'id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (profileError) {
      logError("create-account-profile", profileError, { userId, email });

      // Cleanup: delete auth user if profile creation failed
      await supabase.auth.admin.deleteUser(userId);

      return sendError(
        res,
        "Failed to create user profile",
        ErrorCodes.DATABASE_ERROR
      );
    }

    console.log("[CREATE ACCOUNT] User profile created");

    // STEP 3: Create workspace (pending payment) - check if already exists
    let workspace;
    const { data: existingWorkspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', userId)
      .maybeSingle();

    if (existingWorkspace) {
      console.log("[CREATE ACCOUNT] Using existing workspace:", existingWorkspace.id);
      workspace = existingWorkspace;
    } else {
      const { data: newWorkspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({
          name: workspaceName,
          owner_id: userId,
          onboarding_status: 'pending_payment',
          questionnaire_data: questionnaireAnswers || {},
          subscription_tier: selectedTier,
          subscription_status: 'inactive'
        })
        .select()
        .single();

      if (workspaceError) {
        logError("create-account-workspace", workspaceError, { userId, email });

        // Cleanup: delete profile and auth user
        await supabase.from('user_profiles').delete().eq('id', userId);
        await supabase.auth.admin.deleteUser(userId);

        return sendError(
          res,
          "Failed to create workspace",
          ErrorCodes.DATABASE_ERROR
        );
      }

      workspace = newWorkspace;
    }

    console.log("[CREATE ACCOUNT] Workspace created:", workspace.id);

    // STEP 4: Add user as workspace owner in workspace_members (idempotent)
    const { error: memberError } = await supabase
      .from('workspace_members')
      .upsert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner',
        can_manage_team: true,
        can_manage_settings: true
      }, {
        onConflict: 'workspace_id,user_id',
        ignoreDuplicates: false
      });

    if (memberError) {
      logError("create-account-member", memberError, { userId, workspaceId: workspace.id });
      // Don't fail the whole process for this
      console.warn("[CREATE ACCOUNT] Failed to add workspace member, will retry later");
    }

    console.log("[CREATE ACCOUNT] Account creation completed successfully");

    return sendSuccess(res, {
      userId: userId,
      workspaceId: workspace.id,
      message: "Account created successfully"
    });

  } catch (error) {
    logError("create-account", error);
    return sendError(
      res,
      "Failed to create account",
      ErrorCodes.INTERNAL_ERROR,
      error.message
    );
  }
};
