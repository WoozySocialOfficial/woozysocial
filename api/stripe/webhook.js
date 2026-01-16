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
    [process.env.STRIPE_PRICE_SOLO]: "solo",
    [process.env.STRIPE_PRICE_PRO]: "pro",
    [process.env.STRIPE_PRICE_PRO_PLUS]: "pro_plus",
    [process.env.STRIPE_PRICE_AGENCY]: "agency",
    [process.env.STRIPE_PRICE_BRAND_BOLT]: "brand_bolt",
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

// Create Ayrshare profile for a WORKSPACE (not user!)
// Returns { profileKey, refId } or null on failure
async function createAyrshareProfile(workspaceName) {
  try {
    const axios = require("axios");

    const response = await axios.post(
      "https://api.ayrshare.com/api/profiles/profile",
      {
        title: workspaceName || "My Business",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    if (response.data && response.data.profileKey) {
      console.log(`[WEBHOOK] Created Ayrshare profile: ${response.data.profileKey}, refId: ${response.data.refId}`);
      return {
        profileKey: response.data.profileKey,
        refId: response.data.refId || null
      };
    }

    logError("ayrshare-profile-create", "No profileKey in response", {
      response: response.data,
    });
    return null;
  } catch (error) {
    logError("ayrshare-profile-create", error);
    return null;
  }
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
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .insert({
        name: workspaceName,
        ayr_profile_key: ayrshareProfile.profileKey,
        ayr_ref_id: ayrshareProfile.refId,
        subscription_tier: tier,
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

        console.log(`[WEBHOOK] Session metadata:`, {
          userId,
          tier,
          workspaceName,
          customer: session.customer,
          subscription: session.subscription,
        });

        if (!userId) {
          console.error("[WEBHOOK] No user ID in session metadata");
          break;
        }

        console.log(`[WEBHOOK] Checkout completed for user ${userId}, tier: ${tier}`);

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
