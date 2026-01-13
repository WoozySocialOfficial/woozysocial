const Stripe = require("stripe");
const { getSupabase, logError } = require("../_utils");

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
});

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

// Helper to get raw body from request
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      resolve(data);
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

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    logError("stripe-webhook-signature", err);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  console.log(`[WEBHOOK] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const tier = session.metadata?.tier;
        const workspaceName = session.metadata?.workspace_name || "My Business";

        if (!userId) {
          console.error("[WEBHOOK] No user ID in session metadata");
          break;
        }

        console.log(`[WEBHOOK] Checkout completed for user ${userId}, tier: ${tier}`);

        // Update user subscription status first
        const { error: updateError } = await supabase
          .from("user_profiles")
          .update({
            subscription_status: "active",
            subscription_tier: tier,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (updateError) {
          logError("stripe-webhook-update", updateError, { userId, event: event.type });
        }

        // Check user's existing workspaces (as owner)
        const { data: existingWorkspaces } = await supabase
          .from("workspace_members")
          .select("workspace_id, workspaces!inner(id, name, ayr_profile_key)")
          .eq("user_id", userId)
          .eq("role", "owner");

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

        // Get tier from price ID
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
