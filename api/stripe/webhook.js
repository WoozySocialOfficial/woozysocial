const Stripe = require("stripe");
const { getSupabase, logError } = require("../_utils");

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Disable body parsing - we need raw body for signature verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// Map Stripe price IDs back to tier names
function getTierFromPriceId(priceId) {
  const priceToTier = {
    // Monthly prices
    [process.env.STRIPE_PRICE_SOLO]: "solo",
    [process.env.STRIPE_PRICE_PRO]: "pro",
    [process.env.STRIPE_PRICE_PRO_PLUS]: "pro_plus",
    [process.env.STRIPE_PRICE_AGENCY]: "agency",
    [process.env.STRIPE_PRICE_BRAND_BOLT]: "brand_bolt",
    // Annual prices (same tier names, just different billing frequency)
    [process.env.STRIPE_PRICE_SOLO_ANNUAL]: "solo",
    [process.env.STRIPE_PRICE_PRO_ANNUAL]: "pro",
    [process.env.STRIPE_PRICE_PRO_PLUS_ANNUAL]: "pro_plus",
    [process.env.STRIPE_PRICE_AGENCY_ANNUAL]: "agency",
    [process.env.STRIPE_PRICE_BRAND_BOLT_ANNUAL]: "brand_bolt",
  };
  return priceToTier[priceId] || "unknown";
}

// Normalize tier name from hyphen format to underscore format
// Stripe metadata might have "pro-plus" but database needs "pro_plus"
function normalizeTierName(tier) {
  if (!tier) return tier;
  // Convert hyphens to underscores
  return tier.replace(/-/g, '_');
}

// Helper to get raw body from request
async function getRawBody(req) {
  // Check if body is already a Buffer (Vercel sometimes provides this)
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  // If body exists but isn't a Buffer, it's been parsed - we need the raw body
  // On Vercel, when bodyParser: false, we need to read the stream
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

// Helper function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Create Ayrshare profile for a WORKSPACE (not user!)
// Returns { profileKey, refId } or null on failure
// Includes retry logic with exponential backoff
async function createAyrshareProfile(workspaceName, maxRetries = 3) {
  const axios = require("axios");

  // CRITICAL: Validate API key exists before attempting
  const apiKey = process.env.AYRSHARE_API_KEY;
  if (!apiKey) {
    console.error(`[WEBHOOK] CRITICAL: AYRSHARE_API_KEY environment variable is not set!`);
    logError("ayrshare-profile-create", new Error("AYRSHARE_API_KEY not configured"), { workspaceName });
    return null;
  }

  // Log API key presence (not the actual key)
  console.log(`[WEBHOOK] Ayrshare API key present: ${apiKey.length} characters, starts with: ${apiKey.substring(0, 8)}...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const title = workspaceName || "My Business";
      console.log(`[WEBHOOK] Ayrshare profile creation attempt ${attempt}/${maxRetries}`);
      console.log(`[WEBHOOK] Request details: { title: "${title}" }`);

      const response = await axios.post(
        "https://api.ayrshare.com/api/profiles/profile",
        {
          title: title,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      console.log(`[WEBHOOK] Ayrshare response status: ${response.status}`);
      console.log(`[WEBHOOK] Ayrshare response data:`, JSON.stringify(response.data));

      if (response.data && response.data.profileKey) {
        console.log(`[WEBHOOK] SUCCESS: Created Ayrshare profile: ${response.data.profileKey}, refId: ${response.data.refId}`);
        return {
          profileKey: response.data.profileKey,
          refId: response.data.refId || null
        };
      }

      // No profileKey in response - this is an unexpected response format
      console.error(`[WEBHOOK] Ayrshare API returned unexpected response (attempt ${attempt}):`, JSON.stringify(response.data));

      if (attempt < maxRetries) {
        const retryDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`[WEBHOOK] Retrying in ${retryDelay}ms...`);
        await delay(retryDelay);
      }
    } catch (error) {
      // Log FULL error details for debugging
      const statusCode = error.response?.status;
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || error.message;

      console.error(`[WEBHOOK] ============ AYRSHARE ERROR DETAILS ============`);
      console.error(`[WEBHOOK] Attempt: ${attempt}/${maxRetries}`);
      console.error(`[WEBHOOK] Status code: ${statusCode}`);
      console.error(`[WEBHOOK] Error message: ${errorMessage}`);
      console.error(`[WEBHOOK] Full error response:`, JSON.stringify(errorData));
      console.error(`[WEBHOOK] Error stack:`, error.stack);
      console.error(`[WEBHOOK] ================================================`);

      // Don't retry on certain errors (bad request, unauthorized)
      if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
        console.error(`[WEBHOOK] Non-retryable error (${statusCode}), giving up`);
        console.error(`[WEBHOOK] This usually means: 400=bad request data, 401=invalid API key, 403=forbidden/quota exceeded`);
        logError("ayrshare-profile-create", error, {
          workspaceName,
          attempt,
          statusCode,
          errorData: JSON.stringify(errorData)
        });
        return null;
      }

      if (attempt < maxRetries) {
        const retryDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`[WEBHOOK] Retrying in ${retryDelay}ms...`);
        await delay(retryDelay);
      } else {
        logError("ayrshare-profile-create", error, {
          workspaceName,
          attempts: maxRetries,
          statusCode,
          errorData: JSON.stringify(errorData)
        });
      }
    }
  }

  console.error(`[WEBHOOK] FAILED: Could not create Ayrshare profile after ${maxRetries} attempts for "${workspaceName}"`);
  return null;
}

// Update existing workspace with Ayrshare profile key and ref id on payment
async function updateWorkspaceWithProfile(supabase, workspaceId, tier, workspaceName) {
  try {
    // 1. Create Ayrshare profile (returns { profileKey, refId })
    const ayrshareProfile = await createAyrshareProfile(workspaceName);
    if (!ayrshareProfile) {
      logError("workspace-update", "Failed to create Ayrshare profile", { workspaceId, tier });
      return null;
    }

    // 2. Update existing workspace with profile key AND ref id
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .update({
        ayr_profile_key: ayrshareProfile.profileKey,
        ayr_ref_id: ayrshareProfile.refId,
        subscription_tier: tier,
        plan_type: tier, // Keep plan_type in sync with subscription_tier
        subscription_status: 'active', // Ensure status is active
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId)
      .select()
      .single();

    if (workspaceError) {
      logError("workspace-update", workspaceError, { workspaceId, tier });
      return null;
    }

    console.log(`[WEBHOOK] Updated workspace ${workspace.id} with profile key and ref id`);
    return workspace;
  } catch (error) {
    logError("workspace-update", error, { workspaceId, tier });
    return null;
  }
}

// Create NEW workspace with Ayrshare profile key and ref id (only if user has no workspaces at all)
async function createWorkspaceWithProfile(supabase, userId, tier, workspaceName) {
  try {
    // 1. Create Ayrshare profile (returns { profileKey, refId })
    const ayrshareProfile = await createAyrshareProfile(workspaceName);
    if (!ayrshareProfile) {
      logError("workspace-create", "Failed to create Ayrshare profile", { userId, tier });
      return null;
    }

    // 2. Create workspace with profile key AND ref id
    const { data: workspace, error: workspaceError} = await supabase
      .from("workspaces")
      .insert({
        name: workspaceName,
        slug: workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        owner_id: userId,
        ayr_profile_key: ayrshareProfile.profileKey,
        ayr_ref_id: ayrshareProfile.refId,
        subscription_tier: tier,
        plan_type: tier, // Keep plan_type in sync with subscription_tier
        subscription_status: 'active',
        created_from_payment: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (workspaceError) {
      logError("workspace-create", workspaceError, { userId, tier });
      return null;
    }

    // 3. Add user as owner of the workspace
    const { error: memberError } = await supabase
      .from("workspace_members")
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: "owner",
        can_manage_team: true,
        can_manage_settings: true,
        can_delete_posts: true,
        joined_at: new Date().toISOString(),
      });

    if (memberError) {
      logError("workspace-member-create", memberError, { userId, workspaceId: workspace.id });
      // Don't return null - workspace was created, just membership failed
    }

    console.log(`[WEBHOOK] Created workspace ${workspace.id} with profile key and ref id for user ${userId}`);
    return workspace;
  } catch (error) {
    logError("workspace-create", error, { userId, tier });
    return null;
  }
}

module.exports = async function handler(req, res) {
  console.log("[WEBHOOK] Webhook handler called");
  console.log("[WEBHOOK] Method:", req.method);
  console.log("[WEBHOOK] Headers:", JSON.stringify(req.headers));

  // Only allow POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error("[WEBHOOK] Database not configured");
    return res.status(500).json({ error: "Database not configured" });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[WEBHOOK] Webhook secret not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  console.log("[WEBHOOK] Webhook secret found:", webhookSecret.substring(0, 10) + "...");

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["stripe-signature"];

    console.log("[WEBHOOK] Raw body type:", typeof rawBody);
    console.log("[WEBHOOK] Raw body length:", rawBody?.length || 0);
    console.log("[WEBHOOK] Has signature:", !!signature);

    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    console.log("[WEBHOOK] Event constructed successfully:", event.type);
  } catch (err) {
    console.error("[WEBHOOK] Signature verification failed:", err.message);
    console.error("[WEBHOOK] Error details:", err);
    logError("stripe-webhook-signature", err);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  console.log(`[WEBHOOK] Received event: ${event.type} (ID: ${event.id})`);
  console.log(`[WEBHOOK] Environment check:`, {
    hasSupabase: !!supabase,
    hasAyrshareKey: !!process.env.AYRSHARE_API_KEY,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
  });

  // Check for duplicate events using Stripe event ID (idempotency)
  // Only check for events that perform critical actions like workspace creation
  const criticalEvents = ['checkout.session.completed'];
  if (criticalEvents.includes(event.type)) {
    const { data: existingEvent } = await supabase
      .from('stripe_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .single();

    if (existingEvent) {
      console.log(`[WEBHOOK] Event ${event.id} already processed, skipping`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Record this event as processed
    const { error: eventError } = await supabase
      .from('stripe_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        processed_at: new Date().toISOString()
      });

    if (eventError) {
      console.warn(`[WEBHOOK] Could not record event (may not have stripe_events table):`, eventError.message);
      // Continue anyway - the table might not exist yet
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const tier = normalizeTierName(session.metadata?.tier);
        const workspaceName = session.metadata?.workspace_name || "My Business";
        const isOnboarding = session.metadata?.onboarding === 'true';
        const workspaceId = session.metadata?.workspace_id; // For onboarding flow

        console.log(`[WEBHOOK] Session metadata:`, {
          userId,
          tier,
          workspaceName,
          isOnboarding,
          workspaceId,
          customer: session.customer,
          subscription: session.subscription,
        });

        if (!userId) {
          console.error("[WEBHOOK] No user ID in session metadata");
          break;
        }

        console.log(`[WEBHOOK] Checkout completed for user ${userId}, tier: ${tier}, onboarding: ${isOnboarding}`);

        // ONBOARDING FLOW (from marketing site)
        if (isOnboarding && workspaceId) {
          console.log(`[WEBHOOK] Processing ONBOARDING payment for workspace ${workspaceId}`);
          console.log(`[WEBHOOK] Workspace name for Ayrshare profile: "${workspaceName}"`);

          // STEP 1: Create Ayrshare profile FIRST (before marking as active)
          // This way if it fails, we can track it properly
          console.log(`[WEBHOOK] STEP 1: Creating Ayrshare profile for workspace ${workspaceId}`);
          const ayrshareProfile = await createAyrshareProfile(workspaceName);

          let profileCreationSucceeded = false;
          if (ayrshareProfile) {
            profileCreationSucceeded = true;
            console.log(`[WEBHOOK] Ayrshare profile created successfully: ${ayrshareProfile.profileKey}`);
          } else {
            console.error(`[WEBHOOK] WARNING: Ayrshare profile creation FAILED for workspace ${workspaceId}`);
            console.error(`[WEBHOOK] The workspace will be marked active but NEEDS manual profile creation`);
          }

          // STEP 2: Update workspace status (include profile key if we have it)
          const workspaceUpdateData = {
            onboarding_status: profileCreationSucceeded ? 'completed' : 'profile_creation_failed',
            subscription_status: 'active',
            subscription_tier: tier,
            plan_type: tier, // Keep plan_type in sync with subscription_tier
            updated_at: new Date().toISOString()
          };

          // Add profile key if creation succeeded
          if (ayrshareProfile) {
            workspaceUpdateData.ayr_profile_key = ayrshareProfile.profileKey;
            workspaceUpdateData.ayr_ref_id = ayrshareProfile.refId;
          }

          const { error: workspaceUpdateError } = await supabase
            .from('workspaces')
            .update(workspaceUpdateData)
            .eq('id', workspaceId);

          if (workspaceUpdateError) {
            console.error("[WEBHOOK] Error updating workspace for onboarding:", workspaceUpdateError);
            logError("webhook-onboarding-workspace", workspaceUpdateError, { workspaceId, userId });
          } else {
            console.log(`[WEBHOOK] Workspace ${workspaceId} updated:`, {
              status: 'active',
              tier: tier,
              hasProfileKey: !!ayrshareProfile,
              onboardingStatus: workspaceUpdateData.onboarding_status
            });
          }

          // STEP 3: Update user profile
          const { error: profileUpdateError } = await supabase
            .from('user_profiles')
            .update({
              subscription_status: 'active',
              subscription_tier: tier,
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
              onboarding_completed: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);

          if (profileUpdateError) {
            console.error("[WEBHOOK] Error updating user profile for onboarding:", profileUpdateError);
            logError("webhook-onboarding-profile", profileUpdateError, { userId });
          } else {
            console.log(`[WEBHOOK] User ${userId} profile updated to active subscription`);
          }

          // Final summary
          if (profileCreationSucceeded) {
            console.log(`[WEBHOOK] ✓ ONBOARDING COMPLETE - workspace ${workspaceId} fully set up with Ayrshare profile`);
          } else {
            console.error(`[WEBHOOK] ⚠ ONBOARDING PARTIAL - workspace ${workspaceId} is active but MISSING Ayrshare profile`);
            console.error(`[WEBHOOK] ⚠ Action required: Run fix-ayrshare-profile endpoint for workspace ${workspaceId}`);
            // Log error for monitoring/alerting
            logError("webhook-profile-creation-failed", new Error("Ayrshare profile creation failed during onboarding"), {
              workspaceId,
              userId,
              workspaceName,
              tier
            });
          }

          break; // Exit after handling onboarding
        }

        // EXISTING FLOW (regular checkout or upgrade)
        // Check if this is a BrandBolt (workspace add-on) purchase
        const isBrandBolt = tier === 'brand_bolt';

        if (isBrandBolt) {
          // BrandBolt: Increment workspace add-ons, keep existing tier
          console.log(`[WEBHOOK] BrandBolt purchase detected - incrementing workspace add-ons for user ${userId}...`);

          // Get current add-on count
          const { data: currentProfile } = await supabase
            .from("user_profiles")
            .select("workspace_add_ons")
            .eq("id", userId)
            .single();

          const currentAddOns = currentProfile?.workspace_add_ons || 0;

          const { data: updatedProfile, error: updateError } = await supabase
            .from("user_profiles")
            .update({
              subscription_status: "active",
              workspace_add_ons: currentAddOns + 1,
              stripe_customer_id: session.customer,
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select();

          if (updateError) {
            console.error("[WEBHOOK] Error updating workspace add-ons:", updateError);
            logError("stripe-webhook-update", updateError, { userId, event: event.type });
          } else {
            console.log(`[WEBHOOK] Workspace add-ons incremented successfully:`, updatedProfile);
          }
        } else {
          // Regular tier subscription
          console.log(`[WEBHOOK] Updating user_profiles for user ${userId}...`);
          const { data: updatedProfile, error: updateError } = await supabase
            .from("user_profiles")
            .update({
              subscription_status: "active",
              subscription_tier: tier,
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select();

          if (updateError) {
            console.error("[WEBHOOK] Error updating user profile:", updateError);
            logError("stripe-webhook-update", updateError, { userId, event: event.type });
          } else {
            console.log(`[WEBHOOK] User profile updated successfully:`, updatedProfile);
          }
        }

        // Skip workspace creation for BrandBolt (it's just an add-on purchase)
        if (!isBrandBolt) {
          // Check user's existing workspaces (as owner)
          console.log(`[WEBHOOK] Checking existing workspaces for user ${userId}...`);
          const { data: existingWorkspaces, error: workspaceQueryError } = await supabase
            .from("workspace_members")
            .select("workspace_id, workspaces!inner(id, name, ayr_profile_key)")
            .eq("user_id", userId)
            .eq("role", "owner");

          if (workspaceQueryError) {
            console.error("[WEBHOOK] Error querying workspaces:", workspaceQueryError);
          } else {
            console.log(`[WEBHOOK] Found ${existingWorkspaces?.length || 0} workspaces:`, existingWorkspaces);
          }

          const workspaceWithProfile = existingWorkspaces?.find(
            (w) => w.workspaces?.ayr_profile_key
          );
          const workspaceWithoutProfile = existingWorkspaces?.find(
            (w) => !w.workspaces?.ayr_profile_key
          );

          if (workspaceWithProfile) {
            // User already has a workspace with profile key - nothing to do
            console.log(`[WEBHOOK] User ${userId} already has workspace with profile key: ${workspaceWithProfile.workspace_id}`);
          } else if (workspaceWithoutProfile) {
            // User has existing workspace WITHOUT profile key - UPDATE it
            const existingWorkspace = workspaceWithoutProfile.workspaces;
            console.log(`[WEBHOOK] Updating existing workspace ${existingWorkspace.id} with profile key`);

            const workspace = await updateWorkspaceWithProfile(
              supabase,
              existingWorkspace.id,
              tier,
              existingWorkspace.name || workspaceName
            );

            if (workspace) {
              console.log(`[WEBHOOK] User ${userId} subscription activated, updated workspace ${workspace.id}`);
            } else {
              console.error(`[WEBHOOK] User ${userId} subscription activated but workspace update failed`);
            }
          } else {
            // User has NO workspaces at all - CREATE new one
            console.log(`[WEBHOOK] User ${userId} has no workspaces, creating new one`);

            const workspace = await createWorkspaceWithProfile(
              supabase,
              userId,
              tier,
              workspaceName
            );

            if (workspace) {
              console.log(`[WEBHOOK] User ${userId} subscription activated with new workspace ${workspace.id}`);
            } else {
              console.error(`[WEBHOOK] User ${userId} subscription activated but workspace creation failed`);
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by customer ID
        const { data: user } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (!user) {
          console.error("[WEBHOOK] Could not find user for subscription update");
          break;
        }

        // Get tier from price ID (already normalized with underscores)
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const tier = getTierFromPriceId(priceId);

        const status = subscription.status === "active" ? "active" :
                      subscription.status === "past_due" ? "past_due" :
                      subscription.status === "canceled" ? "cancelled" :
                      subscription.status;

        await supabase
          .from("user_profiles")
          .update({
            subscription_status: status,
            subscription_tier: tier,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        console.log(`[WEBHOOK] Subscription updated for user ${user.id}: ${status}, tier: ${tier}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by customer ID
        const { data: user } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (user) {
          await supabase
            .from("user_profiles")
            .update({
              subscription_status: "cancelled",
              updated_at: new Date().toISOString(),
            })
            .eq("id", user.id);

          console.log(`[WEBHOOK] Subscription cancelled for user ${user.id}`);
          // NOTE: We don't delete the workspace or Ayrshare profile
          // They can resubscribe and regain access
        } else {
          console.error("[WEBHOOK] Could not find user for subscription deletion");
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const { data: user } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (user) {
          await supabase
            .from("user_profiles")
            .update({
              subscription_status: "past_due",
              updated_at: new Date().toISOString(),
            })
            .eq("id", user.id);

          console.log(`[WEBHOOK] Payment failed for user ${user.id}`);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        // Only process if this is a subscription invoice
        if (invoice.subscription) {
          const { data: user } = await supabase
            .from("user_profiles")
            .select("id, subscription_status")
            .eq("stripe_customer_id", customerId)
            .single();

          if (user && user.subscription_status === "past_due") {
            await supabase
              .from("user_profiles")
              .update({
                subscription_status: "active",
                updated_at: new Date().toISOString(),
              })
              .eq("id", user.id);

            console.log(`[WEBHOOK] Payment received, subscription reactivated for user ${user.id}`);
          }
        }
        break;
      }

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    // Return 200 to acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (error) {
    logError("stripe-webhook-handler", error, { eventType: event.type });
    // Still return 200 to prevent Stripe from retrying
    // Log the error for investigation
    return res.status(200).json({ received: true, error: "Handler error logged" });
  }
};
