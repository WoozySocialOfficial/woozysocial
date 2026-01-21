const axios = require("axios");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  isValidEmail,
  isWhitelistedEmail,
  isServiceConfigured
} = require("./_utils");

/**
 * Check if user profile exists and create if missing
 * Also handles whitelisted user setup with Ayrshare profile
 * POST /api/check-and-create-profile
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database not configured", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { userId, email, title, fullName } = req.body;

    if (!userId) {
      return sendError(res, "userId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (!isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    console.log("[CHECK-PROFILE] Checking profile for user:", userId);

    // Check if profile already exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, is_whitelisted, ayr_profile_key, subscription_tier, subscription_status')
      .eq('id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      logError("check-profile-fetch", fetchError, { userId });
    }

    let profile = existingProfile;
    let profileCreated = false;

    // If profile doesn't exist, create it
    if (!profile) {
      console.log("[CHECK-PROFILE] Profile not found, creating...");

      const userEmail = email?.toLowerCase() || null;
      const isWhitelisted = isWhitelistedEmail(userEmail);

      const { data: newProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          email: userEmail,
          full_name: fullName || title?.split("'s")[0] || null,
          is_whitelisted: isWhitelisted,
          subscription_status: isWhitelisted ? 'active' : 'inactive',
          subscription_tier: isWhitelisted ? 'agency' : 'free',
          onboarding_completed: false,
          onboarding_step: 1
        })
        .select()
        .single();

      if (insertError) {
        // Check if it's a duplicate key error (profile was created by trigger)
        if (insertError.code === '23505') {
          console.log("[CHECK-PROFILE] Profile already exists (created by trigger)");
          // Fetch the existing profile
          const { data: refetchedProfile } = await supabase
            .from('user_profiles')
            .select('id, email, full_name, is_whitelisted, ayr_profile_key, subscription_tier, subscription_status')
            .eq('id', userId)
            .single();
          profile = refetchedProfile;
        } else {
          logError("check-profile-insert", insertError, { userId });
          return sendError(res, "Failed to create profile", ErrorCodes.DATABASE_ERROR);
        }
      } else {
        profile = newProfile;
        profileCreated = true;
        console.log("[CHECK-PROFILE] Profile created successfully");
      }
    }

    // Update whitelist status if needed
    const isWhitelisted = isWhitelistedEmail(profile?.email);
    if (profile && isWhitelisted && !profile.is_whitelisted) {
      console.log("[CHECK-PROFILE] Updating whitelist status for:", profile.email);
      await supabase
        .from('user_profiles')
        .update({
          is_whitelisted: true,
          subscription_status: 'active',
          subscription_tier: profile.subscription_tier === 'free' ? 'agency' : profile.subscription_tier
        })
        .eq('id', userId);
    }

    // If user is whitelisted and doesn't have Ayrshare profile, create workspace with profile
    if (isWhitelisted && !profile?.ayr_profile_key) {
      console.log("[CHECK-PROFILE] Whitelisted user without Ayrshare profile, checking workspace...");

      // Check if user has a workspace
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id, workspaces(id, name, ayr_profile_key)')
        .eq('user_id', userId)
        .eq('role', 'owner')
        .single();

      if (membership?.workspaces && !membership.workspaces.ayr_profile_key && isServiceConfigured('ayrshare')) {
        console.log("[CHECK-PROFILE] Creating Ayrshare profile for workspace:", membership.workspace_id);

        try {
          const ayrResponse = await axios.post(
            'https://api.ayrshare.com/api/profiles/profile',
            { title: membership.workspaces.name || title || 'My Business' },
            {
              headers: {
                Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            }
          );

          if (ayrResponse.data?.profileKey) {
            // Update workspace with profile key
            await supabase
              .from('workspaces')
              .update({
                ayr_profile_key: ayrResponse.data.profileKey,
                ayr_ref_id: ayrResponse.data.refId || null
              })
              .eq('id', membership.workspace_id);

            console.log("[CHECK-PROFILE] Ayrshare profile created:", ayrResponse.data.profileKey);
          }
        } catch (ayrError) {
          logError("check-profile-ayrshare", ayrError, { userId, workspaceId: membership?.workspace_id });
          // Don't fail - Ayrshare profile can be created later
        }
      }
    }

    return sendSuccess(res, {
      profileExists: !!profile,
      profileCreated,
      isWhitelisted,
      profile: profile ? {
        id: profile.id,
        email: profile.email,
        hasAyrshareProfile: !!profile.ayr_profile_key
      } : null
    });

  } catch (error) {
    logError("check-and-create-profile", error);
    return sendError(res, "Failed to check/create profile", ErrorCodes.INTERNAL_ERROR);
  }
};
