import express from "express";
import multer from "multer";
import axios from "axios";
import { config } from "dotenv";
import { env } from "process";
import fs from "fs";
import FormData from "form-data";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import Stripe from "stripe";

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

config(); // Load environment variables

// Initialize Supabase client
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Initialize Resend client (optional - only if API key is provided)
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Initialize Stripe client (optional - only if API key is provided)
const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
}) : null;

// Stripe Price ID mapping
const STRIPE_PRICE_IDS = {
  solo: env.STRIPE_PRICE_SOLO,
  pro: env.STRIPE_PRICE_PRO,
  "pro-plus": env.STRIPE_PRICE_PRO_PLUS,
  agency: env.STRIPE_PRICE_AGENCY,
  "brand-bolt": env.STRIPE_PRICE_BRAND_BOLT,
};

const corsOptions = {};

const app = express();
app.use(cors(corsOptions));
const upload = multer({ dest: "uploads/" });

// WARNING: This CORS configuration allows all origins and is not secure for production use
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json());

console.warn(
  "WARNING: Server is configured to accept CORS requests from all origins. This is not secure for production use."
);

async function uploadMediaToAyrshare(file) {
  try {
    console.log(`Uploading media to Ayrshare: ${file.originalname} (${file.mimetype})`);

    const formData = new FormData();
    formData.append("file", fs.createReadStream(file.path), file.originalname);

    const response = await axios.post(`${BASE_AYRSHARE}/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`
      }
    });

    console.log("Media uploaded successfully:", response.data.url);

    // Delete the temporary file
    fs.unlink(file.path, (err) => {
      if (err) console.error("Error deleting temporary file:", err);
    });

    return response.data.url;
  } catch (error) {
    console.error(
      "Error uploading media to Ayrshare:",
      error.response?.data || error.message
    );
    // Don't delete the file if upload failed, for debugging
    throw error;
  }
}

// Note: multer must run BEFORE requireActiveProfile so req.body is populated for FormData
app.post("/api/post", upload.single("media"), requireActiveProfile, async (req, res) => {
  try {
    // DEBUG: Log the raw request body to see what we're receiving
    console.log("=== POST REQUEST DEBUG ===");
    console.log("Raw req.body:", JSON.stringify(req.body, null, 2));
    console.log("req.body.scheduledDate:", req.body.scheduledDate);
    console.log("typeof req.body.scheduledDate:", typeof req.body.scheduledDate);
    console.log("=== END POST REQUEST DEBUG ===");

    const { text, networks, scheduledDate, userId, workspaceId, mediaUrl } = req.body;
    const media = req.file;

    // NEW ARCHITECTURE: Profile keys ONLY live on workspaces
    // workspaceId is required for posting
    if (!workspaceId) {
      return res.status(400).json({
        error: 'Workspace required',
        message: 'workspaceId is required to post. Please select a workspace.'
      });
    }

    // Get workspace's profile key from database
    const profileKey = await getWorkspaceProfileKey(workspaceId);
    if (!profileKey) {
      return res.status(400).json({
        error: 'No social accounts connected',
        message: 'This workspace has no social media accounts connected. Please connect accounts first.'
      });
    }

    console.log(`[POST] Using workspace ${workspaceId} profile key: ${profileKey.substring(0, 8)}...`);

    const platforms = Object.entries(JSON.parse(networks))
      .filter(([, value]) => value)
      .map(([key]) => key);

    const postData = {
      post: text,
      platforms
    };

    if (scheduledDate) {
      // Ayrshare API expects ISO-8601 UTC date time format: "YYYY-MM-DDThh:mm:ssZ"
      // Example: "2025-12-01T10:00:00Z"
      const dateObj = new Date(scheduledDate);
      const now = new Date();
      const secondsUntilPost = (dateObj.getTime() - now.getTime()) / 1000;

      console.log("=== SCHEDULING DEBUG ===");
      console.log("Schedule Date Input (ISO):", scheduledDate);
      console.log("Parsed Date Object:", dateObj.toISOString());
      console.log("Current Time:", now.toISOString());
      console.log("Time until post (seconds):", secondsUntilPost);
      console.log("Time until post (hours):", (secondsUntilPost / 3600).toFixed(2));
      console.log("Is in future?:", secondsUntilPost > 0);

      // Validate that the time is in the future
      if (secondsUntilPost <= 0) {
        console.error("ERROR: Scheduled time is in the past!");
        return res.status(400).json({
          error: "Scheduled time must be in the future",
          details: `Time difference: ${secondsUntilPost} seconds (must be positive)`
        });
      }

      // Ayrshare requires at least 5 minutes in the future
      if (secondsUntilPost < 300) {
        console.warn("WARNING: Scheduled time is less than 5 minutes in future - some platforms may reject this");
      }

      // CRITICAL FIX: Ayrshare expects ISO-8601 string format, NOT Unix timestamp!
      // Format: "2025-01-15T14:00:00Z"
      postData.scheduleDate = dateObj.toISOString();
      console.log("scheduleDate being sent to Ayrshare:", postData.scheduleDate);
      console.log("=== END SCHEDULING DEBUG ===");
    }

    // Handle media: either a new upload or existing URL from draft
    if (media) {
      // New file upload - upload to Ayrshare
      try {
        const mediaUrl = await uploadMediaToAyrshare(media);
        postData.mediaUrls = [mediaUrl];

        // For video uploads, add videoOptions if needed
        if (media.mimetype.startsWith('video/')) {
          postData.videoOptions = {
            title: text?.substring(0, 100) || 'Video Post', // Some platforms require title
          };
        }
      } catch (error) {
        console.error("Failed to upload media:", error);
        return res.status(500).json({
          error: "Failed to upload media",
          details: error.response?.data || error.message
        });
      }
    } else if (mediaUrl) {
      // Existing media URL from draft - use it directly
      postData.mediaUrls = [mediaUrl];

      // For video URLs, add videoOptions if needed
      if (mediaUrl.toLowerCase().includes('video') || mediaUrl.match(/\.(mp4|mov|avi|webm)$/i)) {
        postData.videoOptions = {
          title: text?.substring(0, 100) || 'Video Post',
        };
      }
    }

    console.log("=== FINAL POST DATA TO AYRSHARE ===");
    console.log("postData.scheduleDate:", postData.scheduleDate);
    console.log("postData.scheduleDate type:", typeof postData.scheduleDate);
    console.log("Full postData:", JSON.stringify(postData, null, 2));
    console.log("=== END FINAL POST DATA ===");

    const response = await axios.post(`${BASE_AYRSHARE}/post`, postData, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    console.log("Response from Ayrshare:", response.status, JSON.stringify(response.data, null, 2));

    // Check if Ayrshare returned an error even with 200 status
    if (response.data.status === 'error') {
      console.error("Ayrshare API Error:", JSON.stringify(response.data, null, 2));

      // Extract detailed error messages
      let errorDetails = "Unknown error";
      if (response.data.posts && response.data.posts[0]) {
        const firstPost = response.data.posts[0];
        if (firstPost.errors && Array.isArray(firstPost.errors)) {
          errorDetails = firstPost.errors.map(e => e.message || e).join(", ");
        } else if (firstPost.message) {
          errorDetails = firstPost.message;
        }
      }

      return res.status(400).json({
        error: "Post failed",
        details: errorDetails,
        fullResponse: response.data
      });
    }

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(
      "Error posting to social media:",
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    res.status(500).json({
      error: "Failed to post to social media",
      details: error.response?.data || error.message
    });
  }
});

app.get("/api/post-history", requireActiveProfile, async (req, res) => {
  try {
    const { userId, workspaceId } = req.query;

    // Get workspace's profile key from database, or fall back to user's key, or env variable
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      // Backwards compatibility: support userId for existing code
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    const response = await axios.get(`${BASE_AYRSHARE}/history`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(
      "Error fetching post history:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch post history" });
  }
});

const readPrivateKey = async (privateKeyPathOrContent) => {
  try {
    if (!privateKeyPathOrContent) {
      console.error("[readPrivateKey] No private key path or content provided!");
      throw new Error("Private key not configured");
    }

    let privateKey;

    // Check if it's a file path (contains .pem or starts with path-like characters)
    // and the file exists - use for local development
    if (privateKeyPathOrContent.includes('.pem') || privateKeyPathOrContent.startsWith('./') || privateKeyPathOrContent.startsWith('privatekeys/')) {
      console.log(`[readPrivateKey] Attempting to read from file: ${privateKeyPathOrContent}`);
      try {
        privateKey = fs.readFileSync(privateKeyPathOrContent, {
          encoding: "utf8"
        });
        console.log(`[readPrivateKey] Successfully read from file, length: ${privateKey.length}`);
      } catch (fileError) {
        // File doesn't exist, treat the value as the key content itself
        console.log(`[readPrivateKey] File not found, treating as key content`);
        privateKey = privateKeyPathOrContent;
      }
    } else {
      // It's the actual key content (Vercel/production)
      console.log(`[readPrivateKey] Using direct key content, length: ${privateKeyPathOrContent.length}`);
      privateKey = privateKeyPathOrContent;
    }

    // Replace literal \n with actual newlines if they exist
    privateKey = privateKey.replace(/\\n/g, '\n');
    // Only trim trailing/leading whitespace, preserve internal newlines
    privateKey = privateKey.replace(/^\s+|\s+$/g, '');

    // Validate the key looks correct
    if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
      console.error("[readPrivateKey] Private key appears malformed - missing BEGIN/END markers");
      console.error("[readPrivateKey] Key preview:", privateKey.substring(0, 100));
    }

    return privateKey;
  } catch (error) {
    console.error("[readPrivateKey] Error reading private key:", error);
    throw new Error("Failed to read private key");
  }
};

// Updated endpoint to generate JWT URL with required parameters
app.get("/api/generate-jwt", requireActiveProfile, async (req, res) => {
  try {
    const { userId, workspaceId } = req.query;
    console.log(`[generate-jwt] Called with userId: ${userId}, workspaceId: ${workspaceId}`);

    // Get workspace's profile key from database, or fall back to user's key, or env variable
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    console.log(`[generate-jwt] Default profile key from env: ${profileKey ? 'present' : 'MISSING'}`);

    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
        console.log(`[generate-jwt] Using workspace profile key`);
      }
    } else if (userId) {
      // Backwards compatibility: support userId for existing code
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
        console.log(`[generate-jwt] Using user profile key`);
      }
    }

    console.log(`[generate-jwt] Final profile key: ${profileKey ? 'present' : 'MISSING'}`);
    console.log(`[generate-jwt] AYRSHARE_DOMAIN: ${env.AYRSHARE_DOMAIN ? 'present' : 'MISSING'}`);
    console.log(`[generate-jwt] AYRSHARE_PRIVATE_KEY: ${env.AYRSHARE_PRIVATE_KEY ? 'present (length: ' + env.AYRSHARE_PRIVATE_KEY.length + ')' : 'MISSING'}`);
    console.log(`[generate-jwt] AYRSHARE_API_KEY: ${env.AYRSHARE_API_KEY ? 'present' : 'MISSING'}`);

    const privateKey = await readPrivateKey(env.AYRSHARE_PRIVATE_KEY);
    console.log(`[generate-jwt] Private key processed, length: ${privateKey.length}, starts with: ${privateKey.substring(0, 30)}...`);

    const jwtData = {
      domain: env.AYRSHARE_DOMAIN,
      privateKey,
      profileKey: profileKey,
      verify: true,
      logout: true  // Force logout of any existing Ayrshare sessions in browser
    };

    console.log(`[generate-jwt] Calling Ayrshare generateJWT...`);
    const response = await axios.post(
      `${BASE_AYRSHARE}/profiles/generateJWT`,
      jwtData,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AYRSHARE_API_KEY}`
        }
      }
    );

    console.log(`[generate-jwt] Success! URL received.`);
    res.json({ url: response.data.url });
  } catch (error) {
    console.error(
      "[generate-jwt] Error generating JWT URL:",
      error.response?.data || error.message
    );
    console.error("[generate-jwt] Full error:", error);
    res.status(500).json({
      error: "Failed to generate JWT URL",
      details: error.response?.data || error.message
    });
  }
});

// New endpoint to fetch user's active social accounts
app.get("/api/user-accounts", requireActiveProfile, async (req, res) => {
  try {
    const { userId, workspaceId } = req.query;

    console.log(`[DIAGNOSTIC] /api/user-accounts called with userId: ${userId}, workspaceId: ${workspaceId}`);

    // Get workspace's profile key from database, or fall back to user's key, or env variable
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    console.log(`[DIAGNOSTIC] Default profile key from .env: ${profileKey}`);

    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      console.log(`[DIAGNOSTIC] Workspace profile key from database: ${workspaceProfileKey}`);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
        console.log(`[DIAGNOSTIC] Using workspace's profile key`);
      } else {
        console.log(`[DIAGNOSTIC] No workspace profile key found, falling back to .env`);
      }
    } else if (userId) {
      // Backwards compatibility: support userId for existing code
      const userProfileKey = await getUserProfileKey(userId);
      console.log(`[DIAGNOSTIC] User profile key from database: ${userProfileKey}`);
      if (userProfileKey) {
        profileKey = userProfileKey;
        console.log(`[DIAGNOSTIC] Using user's profile key`);
      } else {
        console.log(`[DIAGNOSTIC] No user profile key found, falling back to .env`);
      }
    } else {
      console.log(`[DIAGNOSTIC] No workspaceId or userId provided, using .env profile key`);
    }

    console.log(`[DIAGNOSTIC] Final profile key being used: ${profileKey}`);

    const response = await axios.get(`${BASE_AYRSHARE}/user`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    const { displayNames } = response.data;

    console.log(`[DIAGNOSTIC] Ayrshare response displayNames:`, displayNames);

    // Handle case where user has no connected accounts
    if (!displayNames || !Array.isArray(displayNames)) {
      return res.json({ accounts: [] });
    }

    // Extract just the platform names for the frontend
    const platformNames = displayNames.map((account) => account.platform);
    console.log(`[DIAGNOSTIC] Returning platform names:`, platformNames);

    res.json({ accounts: platformNames });
  } catch (error) {
    console.error(
      "Error fetching user accounts:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch user accounts" });
  }
});

// DEPRECATED: getUserProfileKey - profile keys now only exist on workspaces
// Keeping for backwards compatibility but returns null
async function getUserProfileKey(userId) {
  console.warn('[DEPRECATED] getUserProfileKey called - profile keys should only be on workspaces');
  return null;
}

// Helper function to get workspace's profile key from database
async function getWorkspaceProfileKey(workspaceId) {
  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('ayr_profile_key')
      .eq('id', workspaceId)
      .single();

    if (error) throw error;
    return data?.ayr_profile_key || null;
  } catch (error) {
    console.error('Error fetching workspace profile key:', error);
    return null;
  }
}

// Endpoint to create a new Ayrshare profile for a user
// Whitelist helper functions
function isWhitelistedEmail(email) {
  const testEmails = env.TEST_ACCOUNT_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];
  const isWhitelisted = testEmails.includes(email.toLowerCase());
  console.log(`[Whitelist Check] Email: ${email}, Whitelisted: ${isWhitelisted}, Whitelist: ${testEmails.join(', ')}`);
  return isWhitelisted;
}

function shouldCreateProfile(email, subscriptionStatus) {
  // In development, allow whitelisted emails
  if (env.NODE_ENV === 'development' && isWhitelistedEmail(email)) {
    return true;
  }

  // In production, require active subscription
  return subscriptionStatus === 'active';
}

// Subscription middleware - checks if user/workspace has active profile access
// NEW ARCHITECTURE: Profile keys live ONLY on workspaces, not user_profiles
async function requireActiveProfile(req, res, next) {
  try {
    // Support both GET (query params) and POST (body params)
    const params = req.method === 'GET' ? req.query : req.body;
    const { userId, workspaceId } = params;

    console.log(`[requireActiveProfile] Method: ${req.method}, userId: ${userId}, workspaceId: ${workspaceId}`);

    // STEP 1: We need to identify the user making the request
    let userIdToCheck = userId;

    // If only workspaceId provided, get the owner's userId
    if (!userId && workspaceId) {
      const { data: workspaceMember, error: memberError } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspaceId)
        .eq('role', 'owner')
        .single();

      if (memberError || !workspaceMember) {
        console.error('Error finding workspace owner:', memberError);
        return res.status(404).json({
          error: 'Workspace not found',
          message: 'Could not find workspace owner'
        });
      }
      userIdToCheck = workspaceMember.user_id;
    }

    if (!userIdToCheck) {
      return res.status(400).json({
        error: 'Authentication required',
        message: 'userId or workspaceId must be provided'
      });
    }

    // STEP 2: Get user profile to check subscription status and whitelist
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('email, subscription_status, is_whitelisted')
      .eq('id', userIdToCheck)
      .single();

    if (profileError || !profile) {
      console.error('Profile lookup error:', profileError, 'for userId:', userIdToCheck);
      return res.status(404).json({
        error: 'User profile not found',
        message: 'Please sign up to continue'
      });
    }

    const isActive = profile.subscription_status === 'active';
    const isWhitelisted = isWhitelistedEmail(profile.email) || profile.is_whitelisted;

    // STEP 3: Check if workspace has a profile key (NEW: profile keys live on workspaces only)
    let workspaceHasProfileKey = false;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      workspaceHasProfileKey = !!workspaceProfileKey;
    }

    // Allow access if:
    // 1. User is whitelisted (can access even without profile key - for initial setup)
    // 2. User has active subscription AND workspace has profile key
    // 3. Workspace has profile key (team member access)
    if (isWhitelisted || (isActive && workspaceHasProfileKey) || workspaceHasProfileKey) {
      console.log(`[requireActiveProfile] Access granted: whitelisted=${isWhitelisted}, active=${isActive}, workspaceKey=${workspaceHasProfileKey}`);
      return next();
    }

    // User doesn't have access - return 403
    console.log(`Access denied for user ${profile.email}: active=${isActive}, whitelisted=${isWhitelisted}, workspaceKey=${workspaceHasProfileKey}`);

    return res.status(403).json({
      error: 'Subscription required',
      message: 'An active subscription is required to use this feature',
      details: {
        hasWorkspaceProfile: workspaceHasProfileKey,
        subscriptionStatus: profile.subscription_status
      },
      upgradeUrl: '/pricing'
    });

  } catch (error) {
    console.error('Error in requireActiveProfile middleware:', error);
    return res.status(500).json({
      error: 'Authentication check failed',
      details: error.message
    });
  }
}

// Check whitelist and create profile if eligible (called at signup)
app.post("/api/check-and-create-profile", async (req, res) => {
  try {
    const { userId, email, title } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ error: "userId and email are required" });
    }

    // Check if user is whitelisted
    if (!isWhitelistedEmail(email)) {
      console.log(`User ${email} is not whitelisted - profile will be created after payment`);
      return res.json({
        profileCreated: false,
        message: 'User not whitelisted - subscription required'
      });
    }

    console.log(`User ${email} is whitelisted - creating Ayrshare profile`);

    // Create Ayrshare profile for whitelisted user
    const privateKey = await readPrivateKey(env.AYRSHARE_PRIVATE_KEY);

    const profileData = {
      title: title || `${email}'s Profile`,
      privateKey: privateKey
    };

    const response = await axios.post(
      `${BASE_AYRSHARE}/profiles/profile`,
      profileData,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AYRSHARE_API_KEY}`
        }
      }
    );

    const { profileKey, refId } = response.data;

    // Store the profile key and update subscription status
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        ayr_profile_key: profileKey,
        ayr_ref_id: refId,
        subscription_status: 'active',
        subscription_tier: 'development',
        profile_created_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user profile:', updateError);
      return res.status(500).json({ error: 'Failed to store profile key' });
    }

    console.log(`Ayrshare profile created for whitelisted user ${email}`);

    res.json({
      profileCreated: true,
      profileKey,
      refId,
      message: 'Profile created for whitelisted user'
    });
  } catch (error) {
    console.error(
      "Error creating Ayrshare profile:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to create Ayrshare profile",
      details: error.response?.data || error.message
    });
  }
});

// Legacy endpoint - keep for manual profile creation if needed
app.post("/api/create-user-profile", async (req, res) => {
  try {
    const { userId, email, title } = req.body;

    if (!userId || !title) {
      return res.status(400).json({ error: "userId and title are required" });
    }

    const privateKey = await readPrivateKey(env.AYRSHARE_PRIVATE_KEY);

    // Create new Ayrshare profile
    const profileData = {
      title: title,
      privateKey: privateKey
    };

    const response = await axios.post(
      `${BASE_AYRSHARE}/profiles/profile`,
      profileData,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AYRSHARE_API_KEY}`
        }
      }
    );

    const { profileKey, refId } = response.data;

    // Store the profile key in user_profiles table
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        ayr_profile_key: profileKey,
        ayr_ref_id: refId,
        subscription_status: 'active',
        profile_created_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user profile:', updateError);
      return res.status(500).json({ error: 'Failed to store profile key' });
    }

    res.json({
      success: true,
      profileKey,
      refId
    });
  } catch (error) {
    console.error(
      "Error creating Ayrshare profile:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to create Ayrshare profile",
      details: error.response?.data || error.message
    });
  }
});

// Endpoint to get analytics and best posting times
app.get("/api/analytics/best-time", requireActiveProfile, async (req, res) => {
  try {
    const { userId, workspaceId } = req.query;

    // Get workspace's profile key from database, or fall back to user's key, or env variable
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      // Backwards compatibility: support userId for existing code
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Try to get analytics from Ayrshare - note: this requires a paid plan
    try {
      const response = await axios.get(`${BASE_AYRSHARE}/analytics/post`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        },
        params: {
          lastDays: 30 // Get last 30 days of data
        }
      });

      // Analyze post times and engagement to find best times
      const posts = response.data.posts || [];
      const hourlyEngagement = {};

      posts.forEach(post => {
        if (post.created && post.likes !== undefined) {
          const date = new Date(post.created);
          const hour = date.getHours();

          if (!hourlyEngagement[hour]) {
            hourlyEngagement[hour] = { totalEngagement: 0, count: 0 };
          }

          const engagement = (post.likes || 0) + (post.comments || 0) + (post.shares || 0);
          hourlyEngagement[hour].totalEngagement += engagement;
          hourlyEngagement[hour].count += 1;
        }
      });

      // Calculate average engagement per hour
      const bestHours = Object.keys(hourlyEngagement)
        .map(hour => ({
          hour: parseInt(hour),
          avgEngagement: hourlyEngagement[hour].totalEngagement / hourlyEngagement[hour].count
        }))
        .sort((a, b) => b.avgEngagement - a.avgEngagement)
        .slice(0, 3); // Top 3 hours

      res.json({
        bestHours,
        totalPosts: posts.length,
        hasData: posts.length > 0
      });
    } catch (apiError) {
      // Analytics API might not be available on free tier
      console.log("Analytics API not available (may require paid plan):", apiError.response?.status);

      // Return default best times based on general social media research
      res.json({
        bestHours: [
          { hour: 9, avgEngagement: 0 },  // 9 AM
          { hour: 13, avgEngagement: 0 }, // 1 PM
          { hour: 18, avgEngagement: 0 }  // 6 PM
        ],
        totalPosts: 0,
        hasData: false,
        isDefault: true
      });
    }
  } catch (error) {
    console.error(
      "Error in best-time endpoint:",
      error.message
    );

    // Return default times even on error
    res.json({
      bestHours: [
        { hour: 9, avgEngagement: 0 },
        { hour: 13, avgEngagement: 0 },
        { hour: 18, avgEngagement: 0 }
      ],
      totalPosts: 0,
      hasData: false,
      isDefault: true
    });
  }
});

// ============================================================
// AYRSHARE POST MANAGEMENT ENDPOINTS
// ============================================================

// Delete a published post
app.delete("/api/post/:id", requireActiveProfile, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, workspaceId } = req.query;

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Delete post from Ayrshare
    const response = await axios.delete(`${BASE_AYRSHARE}/post`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      },
      data: {
        id: id // Ayrshare post ID
      }
    });

    res.json({
      success: true,
      message: "Post deleted successfully",
      data: response.data
    });
  } catch (error) {
    console.error("Error deleting post:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to delete post",
      details: error.response?.data || error.message
    });
  }
});

// Update/Edit a scheduled post
app.patch("/api/post/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, workspaceId, updates } = req.body;

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Update scheduled post on Ayrshare
    const updateData = {
      id: id,
      ...updates
    };

    const response = await axios.patch(`${BASE_AYRSHARE}/post`, updateData, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    res.json({
      success: true,
      message: "Post updated successfully",
      data: response.data
    });
  } catch (error) {
    console.error("Error updating post:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to update post",
      details: error.response?.data || error.message
    });
  }
});

// Retry a failed post
app.put("/api/post/retry", requireActiveProfile, async (req, res) => {
  try {
    const { userId, workspaceId, postId } = req.body;

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Retry post on Ayrshare
    const response = await axios.put(`${BASE_AYRSHARE}/post/retry`,
      { id: postId },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        }
      }
    );

    res.json({
      success: true,
      message: "Post retry initiated",
      data: response.data
    });
  } catch (error) {
    console.error("Error retrying post:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to retry post",
      details: error.response?.data || error.message
    });
  }
});

// Get individual post details
app.get("/api/post/:id", requireActiveProfile, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, workspaceId } = req.query;

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Get post details from Ayrshare
    const response = await axios.get(`${BASE_AYRSHARE}/post/${id}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error("Error fetching post details:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch post details",
      details: error.response?.data || error.message
    });
  }
});

// Generate hashtags for a post
app.post("/api/hashtag/generate", async (req, res) => {
  try {
    const { text, numHashtags } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    // Call OpenAI to generate relevant hashtags
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a social media hashtag expert. Generate relevant, trending hashtags based on the content provided. Return ONLY the hashtags, one per line, without numbering or explanation.'
          },
          {
            role: 'user',
            content: `Generate ${numHashtags || 5} relevant hashtags for this social media post:\n\n${text}`
          }
        ],
        temperature: 0.7,
        max_tokens: 100
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        }
      }
    );

    const hashtagText = openaiResponse.data.choices[0].message.content;
    const hashtags = hashtagText
      .split('\n')
      .map(tag => tag.trim())
      .filter(tag => tag.startsWith('#'))
      .slice(0, numHashtags || 5);

    res.json({
      success: true,
      hashtags
    });
  } catch (error) {
    console.error("Error generating hashtags:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to generate hashtags",
      details: error.response?.data || error.message
    });
  }
});

// ============================================================
// COMMENTS MANAGEMENT ENDPOINTS
// ============================================================

// Get comments for a post
app.get("/api/comments/:postId", async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, workspaceId } = req.query;

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Get comments from Ayrshare
    const response = await axios.get(`${BASE_AYRSHARE}/comments/${postId}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error("Error fetching comments:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch comments",
      details: error.response?.data || error.message
    });
  }
});

// Add a comment to a post
app.post("/api/comments", async (req, res) => {
  try {
    const { userId, workspaceId, postId, comment, platform } = req.body;

    if (!postId || !comment) {
      return res.status(400).json({ error: "postId and comment are required" });
    }

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Post comment to Ayrshare
    const response = await axios.post(`${BASE_AYRSHARE}/comments`,
      {
        id: postId,
        comment: comment,
        platform: platform // Optional: facebook, instagram, etc.
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        }
      }
    );

    res.json({
      success: true,
      message: "Comment posted successfully",
      data: response.data
    });
  } catch (error) {
    console.error("Error posting comment:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to post comment",
      details: error.response?.data || error.message
    });
  }
});

// Reply to a comment
app.post("/api/comments/reply/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    const { userId, workspaceId, reply, platform } = req.body;

    if (!reply) {
      return res.status(400).json({ error: "reply is required" });
    }

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Reply to comment on Ayrshare
    const response = await axios.post(`${BASE_AYRSHARE}/comments/reply/${commentId}`,
      {
        comment: reply,
        platform: platform
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        }
      }
    );

    res.json({
      success: true,
      message: "Reply posted successfully",
      data: response.data
    });
  } catch (error) {
    console.error("Error posting reply:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to post reply",
      details: error.response?.data || error.message
    });
  }
});

// Delete a comment
app.delete("/api/comments/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    const { userId, workspaceId, platform, deleteAll } = req.query;

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Delete comment on Ayrshare
    const response = await axios.delete(`${BASE_AYRSHARE}/comments/${commentId}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      },
      data: {
        platform: platform,
        deleteAll: deleteAll === 'true' // Delete all comments under a post
      }
    });

    res.json({
      success: true,
      message: "Comment deleted successfully",
      data: response.data
    });
  } catch (error) {
    console.error("Error deleting comment:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to delete comment",
      details: error.response?.data || error.message
    });
  }
});

// ============================================================
// LINK SHORTENING & TRACKING ENDPOINTS
// ============================================================

// Create a shortened link
app.post("/api/links", async (req, res) => {
  try {
    const { userId, workspaceId, url, utmParams } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Create short link via Ayrshare
    const linkData = {
      url: url
    };

    // Add UTM parameters if provided
    if (utmParams) {
      linkData.utmParams = utmParams;
    }

    const response = await axios.post(`${BASE_AYRSHARE}/links`, linkData, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    res.json({
      success: true,
      shortLink: response.data.shortUrl || response.data.url,
      linkId: response.data.id,
      data: response.data
    });
  } catch (error) {
    console.error("Error creating short link:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to create short link",
      details: error.response?.data || error.message
    });
  }
});

// Get link analytics
app.get("/api/links/:linkId", async (req, res) => {
  try {
    const { linkId } = req.params;
    const { userId, workspaceId } = req.query;

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) {
        profileKey = workspaceProfileKey;
      }
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) {
        profileKey = userProfileKey;
      }
    }

    // Get link analytics from Ayrshare
    const response = await axios.get(`${BASE_AYRSHARE}/links/${linkId}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    res.json({
      success: true,
      analytics: response.data
    });
  } catch (error) {
    console.error("Error fetching link analytics:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch link analytics",
      details: error.response?.data || error.message
    });
  }
});

// AI Post Generation endpoint
app.post("/api/generate-post", async (req, res) => {
  try {
    const { userId, workspaceId, prompt, platforms } = req.body;

    if (!workspaceId && !userId) {
      return res.status(400).json({ error: "workspaceId or userId is required" });
    }

    // Fetch brand profile from Supabase
    let brandProfile = null;
    let profileError = null;

    if (workspaceId) {
      // Fetch by workspace_id (new method)
      const result = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .single();

      brandProfile = result.data;
      profileError = result.error;
    } else if (userId) {
      // Backwards compatibility: fetch by user_id
      const result = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      brandProfile = result.data;
      profileError = result.error;
    }

    if (profileError && profileError.code !== 'PGRST116') {
      console.error("Error fetching brand profile:", profileError);
    }

    // Build AI prompt with brand context
    let systemPrompt = "You are a social media content expert. Generate engaging social media posts.";
    let userPrompt = prompt || "Generate an engaging social media post";

    if (brandProfile) {
      systemPrompt += `\n\nBrand Context:`;
      if (brandProfile.brand_name) systemPrompt += `\n- Brand: ${brandProfile.brand_name}`;
      if (brandProfile.brand_description) systemPrompt += `\n- About: ${brandProfile.brand_description}`;
      if (brandProfile.tone_of_voice) systemPrompt += `\n- Tone: ${brandProfile.tone_of_voice}`;
      if (brandProfile.target_audience) systemPrompt += `\n- Audience: ${brandProfile.target_audience}`;
      if (brandProfile.key_topics) systemPrompt += `\n- Topics: ${brandProfile.key_topics}`;
      if (brandProfile.brand_values) systemPrompt += `\n- Values: ${brandProfile.brand_values}`;
      if (brandProfile.sample_posts) systemPrompt += `\n- Style Examples:\n${brandProfile.sample_posts}`;
    }

    if (platforms && platforms.length > 0) {
      systemPrompt += `\n\nOptimize for these platforms: ${platforms.join(', ')}`;
    }

    systemPrompt += `\n\nGenerate 3 short variations. Separate each with "---" on a new line. Be concise. Include hashtags.`;

    // Call OpenAI API
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 350
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        }
      }
    );

    const generatedText = openaiResponse.data.choices[0].message.content;

    // Split variations using the --- delimiter
    let variations = generatedText.split(/\n---\n|\n\n---\n\n/).map(v => v.trim()).filter(v => v.length > 0);

    // Fallback: if splitting didn't work, try other common patterns
    if (variations.length === 1) {
      variations = generatedText.split(/\n\n(?=\d+\.|\*\*Variation|\*Variation)/).map(v => v.trim()).filter(v => v.length > 0);
    }

    // If still only one variation, split by double line breaks as last resort
    if (variations.length === 1) {
      const parts = generatedText.split(/\n\n+/).map(v => v.trim()).filter(v => v.length > 20);
      if (parts.length >= 3) {
        variations = parts.slice(0, 3);
      }
    }

    res.json({
      success: true,
      variations: variations.length > 1 ? variations : [generatedText],
      brandProfileUsed: !!brandProfile
    });
  } catch (error) {
    console.error("Error generating post:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to generate post",
      details: error.response?.data || error.message
    });
  }
});

// ============================================================
// WORKSPACE MANAGEMENT ENDPOINTS
// ============================================================

// Get workspace details
app.get("/api/workspaces/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    // Verify user has access to this workspace
    if (userId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', id)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        return res.status(403).json({ error: "Access denied to this workspace" });
      }
    }

    // Fetch workspace
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(workspace);
  } catch (error) {
    console.error("Error fetching workspace:", error);
    res.status(500).json({ error: "Failed to fetch workspace" });
  }
});

// Update workspace settings
app.put("/api/workspaces/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, updates } = req.body;

    // Verify user is owner of this workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', id)
      .eq('user_id', userId)
      .single();

    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ error: "Only workspace owners can update settings" });
    }

    // Update workspace
    const { data, error } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, workspace: data });
  } catch (error) {
    console.error("Error updating workspace:", error);
    res.status(500).json({ error: "Failed to update workspace" });
  }
});

// Get workspace members
app.get("/api/workspaces/:id/members", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', id)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      return res.status(403).json({ error: "Access denied to this workspace" });
    }

    // Fetch all members of the workspace
    const { data: members, error } = await supabase
      .from('workspace_members')
      .select(`
        *,
        user:user_profiles(id, full_name, email)
      `)
      .eq('workspace_id', id)
      .order('joined_at', { ascending: true });

    if (error) throw error;

    res.json({ members });
  } catch (error) {
    console.error("Error fetching workspace members:", error);
    res.status(500).json({ error: "Failed to fetch workspace members" });
  }
});

// Invite member to workspace
app.post("/api/workspaces/:id/invite", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, email, role } = req.body;

    // Verify user has permission to invite members
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role, can_manage_team')
      .eq('workspace_id', id)
      .eq('user_id', userId)
      .single();

    // Owners and admins always have permission, or explicit can_manage_team permission
    const hasPermission = membership && (
      membership.role === 'owner' ||
      membership.role === 'admin' ||
      membership.can_manage_team === true
    );

    if (!hasPermission) {
      return res.status(403).json({ error: "You do not have permission to invite members" });
    }

    // Check if there's already a pending invitation for this email
    const { data: existingInvite } = await supabase
      .from('workspace_invitations')
      .select('id, status')
      .eq('workspace_id', id)
      .eq('email', email.toLowerCase())
      .single();

    if (existingInvite && existingInvite.status === 'pending') {
      return res.status(400).json({ error: "An invitation has already been sent to this email" });
    }

    // Check if user with this email is already a member
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (userProfile) {
      const { data: existingMember } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', id)
        .eq('user_id', userProfile.id)
        .single();

      if (existingMember) {
        return res.status(400).json({ error: "User is already a member of this workspace" });
      }
    }

    // Create invitation (invite_token is auto-generated by database as UUID)
    const { data: invitation, error } = await supabase
      .from('workspace_invitations')
      .insert({
        workspace_id: id,
        email: email.toLowerCase(),
        role: role || 'editor',
        invited_by: userId,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      .select()
      .single();

    if (error) {
      console.error("Database error creating invitation:", error);
      throw error;
    }

    // Get workspace name for the email
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', id)
      .single();

    // Send invitation email if Resend is configured
    if (resend) {
      const { data: inviterData } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', userId)
        .single();

      const inviterName = inviterData?.full_name || inviterData?.email || 'A team member';
      const workspaceName = workspace?.name || 'a workspace';
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const inviteLink = `${appUrl}/accept-invite?token=${invitation.invite_token}`;

      try {
        await resend.emails.send({
          from: 'Woozy Social <hello@woozysocial.com>',
          to: [email],
          subject: `${inviterName} invited you to join ${workspaceName} on Woozy Social`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>You've been invited!</h2>
              <p>${inviterName} has invited you to join <strong>${workspaceName}</strong> on Woozy Social.</p>
              <p>Role: <strong>${role || 'editor'}</strong></p>
              <p style="margin: 30px 0;">
                <a href="${inviteLink}" style="background-color: #FFC801; color: #114C5A; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Accept Invitation
                </a>
              </p>
              <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
            </div>
          `
        });
        console.log('Invitation email sent to:', email);
      } catch (emailError) {
        console.error('Email error:', emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.log(`[Dev] Invitation created for ${email}, token: ${invitation.invite_token}`);
      console.log(`[Dev] Accept URL: ${process.env.APP_URL || 'http://localhost:5173'}/accept-invite?token=${invitation.invite_token}`);
    }

    res.json({ success: true, invitation });
  } catch (error) {
    console.error("Error inviting member:", error);
    res.status(500).json({
      error: "Failed to invite member",
      details: error.message || error.toString()
    });
  }
});

// Get pending invitations for a workspace
app.get("/api/workspaces/:id/invitations", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    // Verify user has permission to view invitations
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role, can_manage_team')
      .eq('workspace_id', id)
      .eq('user_id', userId)
      .single();

    // Owners and admins always have permission, or explicit can_manage_team permission
    const hasPermission = membership && (
      membership.role === 'owner' ||
      membership.role === 'admin' ||
      membership.can_manage_team === true
    );

    if (!hasPermission) {
      return res.status(403).json({ error: "You do not have permission to view invitations" });
    }

    // Fetch pending invitations
    const { data: invitations, error } = await supabase
      .from('workspace_invitations')
      .select('*')
      .eq('workspace_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ invitations: invitations || [] });
  } catch (error) {
    console.error("Error fetching invitations:", error);
    res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

// Remove member from workspace
app.delete("/api/workspaces/:workspaceId/members/:memberId", async (req, res) => {
  try {
    const { workspaceId, memberId } = req.params;
    const { userId } = req.query;

    // Verify user has permission to remove members
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role, can_manage_team')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (!membership || !membership.can_manage_team) {
      return res.status(403).json({ error: "You do not have permission to remove members" });
    }

    // Cannot remove yourself
    if (memberId === userId) {
      return res.status(400).json({ error: "You cannot remove yourself from the workspace" });
    }

    // Remove member
    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

// Update member role
app.put("/api/workspaces/:workspaceId/members/:memberId", async (req, res) => {
  try {
    const { workspaceId, memberId } = req.params;
    const { userId, role, permissions } = req.body;

    // Verify user has permission to update members
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role, can_manage_team')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (!membership || !membership.can_manage_team) {
      return res.status(403).json({ error: "You do not have permission to update members" });
    }

    // Cannot change your own role
    if (memberId === userId) {
      return res.status(400).json({ error: "You cannot change your own role" });
    }

    // Update member
    const updateData = { role };
    if (permissions) {
      if (permissions.canManageTeam !== undefined) updateData.can_manage_team = permissions.canManageTeam;
      if (permissions.canManageSettings !== undefined) updateData.can_manage_settings = permissions.canManageSettings;
      if (permissions.canDeletePosts !== undefined) updateData.can_delete_posts = permissions.canDeletePosts;
    }

    const { error } = await supabase
      .from('workspace_members')
      .update(updateData)
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating member role:", error);
    res.status(500).json({ error: "Failed to update member role" });
  }
});

// ============================================================
// TEAM INVITATION ENDPOINT
// ============================================================

app.post("/api/send-team-invite", async (req, res) => {
  try {
    const { email, role, userId } = req.body;

    // Validate input
    if (!email || !role || !userId) {
      return res.status(400).json({ error: "Email, role, and userId are required" });
    }

    // Validate role
    const validRoles = ['admin', 'editor', 'view_only'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, editor, or view_only' });
    }

    // Check if email is already a team member
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('owner_id', userId)
      .eq('email', email.toLowerCase())
      .single();

    if (existingMember) {
      return res.status(400).json({ error: 'This user is already a team member' });
    }

    // Check if there's already a pending invitation
    const { data: existingInvite } = await supabase
      .from('team_invitations')
      .select('id, status')
      .eq('owner_id', userId)
      .eq('email', email.toLowerCase())
      .single();

    if (existingInvite && existingInvite.status === 'pending') {
      return res.status(400).json({ error: 'An invitation has already been sent to this email' });
    }

    // Create the invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .insert({
        owner_id: userId,
        email: email.toLowerCase(),
        role: role,
        status: 'pending',
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Error creating invitation:', inviteError);
      return res.status(500).json({ error: 'Failed to create invitation' });
    }

    console.log('Invitation created successfully:', invitation.id);

    // Get inviter's email/name
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const inviterName = userData?.user?.email || 'A team member';

    // Generate invitation link
    const appUrl = env.APP_URL || 'http://localhost:5173';
    const inviteLink = `${appUrl}/accept-invite?token=${invitation.invite_token}`;

    // Helper function to get role label
    const getRoleLabel = (role) => {
      const labels = {
        admin: 'Admin',
        editor: 'Editor',
        view_only: 'View Only',
      };
      return labels[role] || role;
    };

    // Helper function to get role description
    const getRoleDescription = (role) => {
      const descriptions = {
        admin: 'Full access - can invite, remove members, and manage all posts',
        editor: 'Can create, edit, and delete posts',
        view_only: 'Read-only access - can view posts and team members',
      };
      return descriptions[role] || '';
    };

    // Send email via Resend (only if configured)
    if (resend) {
      try {
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F1F6F4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 16px; border: 2px solid rgba(0, 0, 0, 0.4); box-shadow: 0 4px 12px rgba(17, 76, 90, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px; text-align: center; background-color: #114C5A; border-radius: 14px 14px 0 0;">
              <h1 style="margin: 0; color: #FFC801; font-size: 28px; font-weight: 700;">You're Invited!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #114C5A; line-height: 1.6;">
                Hi there,
              </p>

              <p style="margin: 0 0 20px 0; font-size: 16px; color: #114C5A; line-height: 1.6;">
                <strong>${inviterName}</strong> has invited you to join their team as a <strong>${getRoleLabel(role)}</strong>.
              </p>

              <div style="background-color: #F1F6F4; border: 2px solid rgba(0, 0, 0, 0.1); border-radius: 10px; padding: 20px; margin: 30px 0;">
                <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #114C5A;">Your Role:</p>
                <p style="margin: 0; font-size: 14px; color: #114C5A; opacity: 0.8;">${getRoleDescription(role)}</p>
              </div>

              <p style="margin: 0 0 30px 0; font-size: 16px; color: #114C5A; line-height: 1.6;">
                Click the button below to accept this invitation and get started:
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 10px; background-color: #FFC801;">
                    <a href="${inviteLink}" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 600; color: #114C5A; text-decoration: none; border-radius: 10px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0 0; font-size: 14px; color: #114C5A; opacity: 0.7; line-height: 1.6;">
                This invitation will expire in <strong>7 days</strong>. If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; background-color: #F1F6F4; border-radius: 0 0 14px 14px; border-top: 2px solid rgba(0, 0, 0, 0.1);">
              <p style="margin: 0; font-size: 12px; color: #114C5A; opacity: 0.6;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${inviteLink}" style="color: #114C5A; word-break: break-all;">${inviteLink}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim();

        const { data: emailData, error: emailError } = await resend.emails.send({
          from: 'Social Media Team <hello@woozysocial.com>',
          to: [email],
          subject: `${inviterName} invited you to join their team`,
          html: emailHtml,
        });

        if (emailError) {
          console.error('Error sending email:', emailError);
          // Don't fail the whole request if email fails
        } else {
          console.log('Email sent successfully:', emailData);
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        // Don't fail the whole request if email fails
      }
    } else {
      console.log('Resend not configured - skipping email send');
    }

    res.json({
      success: true,
      message: 'Invitation sent successfully',
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
      },
    });
  } catch (error) {
    console.error("Error in send-team-invite:", error.message);
    res.status(500).json({ error: "Failed to send invitation", details: error.message });
  }
});

// Validate Team Invitation endpoint (public - no auth required)
app.get("/api/team/validate-invite", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    // Fetch the invitation by token using service role (bypasses RLS)
    const { data: invitation, error: fetchError } = await supabase
      .from('team_invitations')
      .select('id, email, role, status, invited_at, expires_at, owner_id')
      .eq('invite_token', token)
      .single();

    if (fetchError || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Return invitation data (don't include sensitive fields like invite_token)
    res.json({ data: invitation });

  } catch (error) {
    console.error('Error validating invitation:', error);
    res.status(500).json({ error: "Failed to validate invitation", details: error.message });
  }
});

// Accept Team Invitation endpoint
app.post("/api/team/accept-invite", async (req, res) => {
  try {
    const { token, userId } = req.body;

    // Validate input
    if (!token || !userId) {
      return res.status(400).json({ error: "Token and userId are required" });
    }

    // Fetch the invitation by token
    const { data: invitation, error: fetchError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (fetchError || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return res.status(400).json({
        error: `This invitation has already been ${invitation.status}`
      });
    }

    // Check if invitation has expired
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    if (now > expiresAt) {
      // Update status to expired
      await supabase
        .from('team_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return res.status(400).json({ error: 'This invitation has expired' });
    }

    // Get user's email to verify it matches the invitation
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const userEmail = userData?.user?.email?.toLowerCase();

    if (!userEmail || userEmail !== invitation.email.toLowerCase()) {
      return res.status(403).json({
        error: 'This invitation was sent to a different email address'
      });
    }

    // Check if user is already a team member
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('owner_id', invitation.owner_id)
      .eq('member_id', userId)
      .single();

    if (existingMember) {
      // Delete the invitation since they're already a member
      await supabase
        .from('team_invitations')
        .delete()
        .eq('id', invitation.id);

      return res.status(400).json({ error: 'You are already a member of this team' });
    }

    // Create the team member record
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        owner_id: invitation.owner_id,
        member_id: userId,
        role: invitation.role,
        joined_at: new Date().toISOString()
      });

    if (memberError) {
      console.error('Error creating team member:', memberError);
      return res.status(500).json({ error: 'Failed to add you to the team' });
    }

    // Delete the invitation after successful acceptance
    const { error: deleteError } = await supabase
      .from('team_invitations')
      .delete()
      .eq('id', invitation.id);

    if (deleteError) {
      console.error('Error deleting invitation:', deleteError);
      // Don't fail the request - the member was created successfully
    }

    console.log('Team invitation accepted successfully:', invitation.id);

    // Get owner's email for confirmation
    const { data: ownerData } = await supabase.auth.admin.getUserById(invitation.owner_id);
    const ownerEmail = ownerData?.user?.email;

    // Send confirmation email to the owner
    if (ownerEmail) {
      try {
        await resend.emails.send({
          from: 'hello@woozysocial.com',
          to: ownerEmail,
          subject: `${userEmail} accepted your team invitation`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #114C5A; color: #FFC801; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 2px solid #114C5A; border-top: none; border-radius: 0 0 8px 8px; }
    .info-box { background: #F1F6F4; border: 2px solid #114C5A; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">Team Invitation Accepted!</h1>
    </div>
    <div class="content">
      <p>Great news! <strong>${userEmail}</strong> has accepted your invitation to join your team.</p>

      <div class="info-box">
        <p style="margin: 0;"><strong>Email:</strong> ${invitation.email}</p>
        <p style="margin: 10px 0 0 0;"><strong>Role:</strong> ${invitation.role}</p>
      </div>

      <p>They now have access to your team and can start collaborating with you.</p>

      <p style="margin-top: 30px;">
        <a href="${env.APP_URL || 'http://localhost:5173'}/team"
           style="background: #114C5A; color: #FFC801; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
          View Team Members
        </a>
      </p>
    </div>
    <div class="footer">
      <p>This is an automated message from Woozy Social.</p>
    </div>
  </div>
</body>
</html>
          `
        });
      } catch (emailError) {
        console.error('Error sending confirmation email to owner:', emailError);
        // Don't fail the request - the acceptance was successful
      }
    }

    res.json({
      message: 'Successfully joined the team!',
      role: invitation.role
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: "Failed to accept invitation", details: error.message });
  }
});

// Get Team Members for an owner
app.get("/api/team/members", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('id, owner_id, member_id, role, created_at, joined_at, invited_by')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (membersError) {
      console.error('Error fetching team members:', membersError);
      return res.status(500).json({ error: 'Failed to fetch team members' });
    }

    const memberIds = (members || []).map((member) => member.member_id);
    let profilesById = {};

    if (memberIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, email, full_name')
        .in('id', memberIds);

      if (profilesError) {
        console.error('Error fetching user profiles:', profilesError);
      } else {
        profilesById = (profiles || []).reduce((acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        }, {});
      }
    }

    const enrichedMembers = (members || []).map((member) => ({
      ...member,
      profile: profilesById[member.member_id] || null,
    }));

    return res.json({ data: enrichedMembers });
  } catch (error) {
    console.error('Error fetching team members:', error);
    return res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Get Pending Invitations for an owner
app.get("/api/team/pending-invites", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const { data: invites, error: invitesError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('owner_id', userId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false });

    if (invitesError) {
      console.error('Error fetching pending invites:', invitesError);
      return res.status(500).json({ error: 'Failed to fetch pending invites' });
    }

    return res.json({ data: invites || [] });
  } catch (error) {
    console.error('Error fetching pending invites:', error);
    return res.status(500).json({ error: 'Failed to fetch pending invites' });
  }
});

// Cancel a pending invitation
app.post("/api/team/cancel-invite", async (req, res) => {
  try {
    const { inviteId, userId } = req.body;

    if (!inviteId || !userId) {
      return res.status(400).json({ error: "inviteId and userId are required" });
    }

    const { data: invite, error: inviteError } = await supabase
      .from('team_invitations')
      .select('id, owner_id, status')
      .eq('id', inviteId)
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invite.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to cancel this invitation' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invitations can be cancelled' });
    }

    const { error: cancelError } = await supabase
      .from('team_invitations')
      .update({ status: 'cancelled' })
      .eq('id', inviteId);

    if (cancelError) {
      console.error('Error canceling invitation:', cancelError);
      return res.status(500).json({ error: 'Failed to cancel invitation' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Error canceling invitation:', error);
    return res.status(500).json({ error: 'Failed to cancel invitation' });
  }
});

// Remove Team Member endpoint
app.post("/api/team/remove-member", async (req, res) => {
  try {
    const { memberId, userId } = req.body;

    if (!memberId || !userId) {
      return res.status(400).json({ error: "memberId and userId are required" });
    }

    // Fetch the team member record
    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .select('id, owner_id, member_id')
      .eq('id', memberId)
      .single();

    if (memberError || !member) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    // Verify the requester is the owner
    if (member.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the team owner can remove members' });
    }

    // Prevent owner from removing themselves
    if (member.member_id === userId) {
      return res.status(400).json({ error: 'Cannot remove yourself from the team' });
    }

    // Delete the team member record
    const { error: deleteError } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (deleteError) {
      console.error('Error removing team member:', deleteError);
      return res.status(500).json({ error: 'Failed to remove team member' });
    }

    res.json({ success: true, message: 'Team member removed successfully' });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// Update Team Member Role endpoint
app.post("/api/team/update-role", async (req, res) => {
  try {
    const { memberId, newRole, userId } = req.body;

    if (!memberId || !newRole || !userId) {
      return res.status(400).json({ error: "memberId, newRole, and userId are required" });
    }

    // Validate role
    const validRoles = ['admin', 'editor', 'view_only'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, editor, or view_only' });
    }

    // Fetch the team member record
    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .select('id, owner_id, member_id, role')
      .eq('id', memberId)
      .single();

    if (memberError || !member) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    // Verify the requester is the owner
    if (member.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the team owner can change member roles' });
    }

    // Update the role
    const { error: updateError } = await supabase
      .from('team_members')
      .update({ role: newRole })
      .eq('id', memberId);

    if (updateError) {
      console.error('Error updating team member role:', updateError);
      return res.status(500).json({ error: 'Failed to update member role' });
    }

    res.json({ success: true, message: 'Member role updated successfully', newRole });
  } catch (error) {
    console.error('Error updating team member role:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// ============================================================
// WORKSPACE MANAGEMENT ENDPOINTS
// ============================================================

// Helper to generate URL-friendly slug
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    + '-' + Date.now().toString(36);
};

// List user's workspaces
app.get("/api/workspace/list", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Get all workspaces for this user
    const { data: memberships, error } = await supabase
      .from('workspace_members')
      .select(`
        role,
        workspace:workspaces(
          id,
          name,
          slug,
          logo_url,
          ayr_profile_key,
          created_at
        )
      `)
      .eq('user_id', userId);

    if (error) {
      console.error("Error fetching workspaces:", error);
      return res.status(500).json({ error: "Failed to fetch workspaces" });
    }

    // Get user's last workspace preference
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('last_workspace_id')
      .eq('id', userId)
      .single();

    // Transform the data
    const workspaces = (memberships || [])
      .filter(m => m.workspace)
      .map(m => ({
        ...m.workspace,
        membership: { role: m.role }
      }));

    res.json({
      success: true,
      workspaces: workspaces,
      lastWorkspaceId: userProfile?.last_workspace_id || null
    });

  } catch (error) {
    console.error("Error listing workspaces:", error);
    res.status(500).json({ error: "Failed to list workspaces" });
  }
});

// Migrate user to workspace (create default workspace)
app.post("/api/workspace/migrate", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Check if user already has a workspace
    const { data: existingMembership } = await supabase
      .from('workspace_members')
      .select('workspace_id, workspaces(*)')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (existingMembership?.workspace_id) {
      return res.json({
        success: true,
        migrated: false,
        workspace: existingMembership.workspaces
      });
    }

    // Get user's profile
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('full_name, email, ayr_profile_key, ayr_ref_id')
      .eq('id', userId)
      .single();

    // Create default workspace
    const workspaceName = userProfile?.full_name
      ? `${userProfile.full_name}'s Business`
      : 'My Business';
    const slug = generateSlug(workspaceName);

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceName,
        slug: slug,
        ayr_profile_key: userProfile?.ayr_profile_key || null,
        ayr_ref_id: userProfile?.ayr_ref_id || null
      })
      .select()
      .single();

    if (workspaceError) {
      console.error("Workspace creation error:", workspaceError);
      return res.status(500).json({ error: "Failed to create workspace" });
    }

    // Add user as owner with full permissions
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner',
        can_manage_team: true,
        can_manage_settings: true,
        can_delete_posts: true
      });

    if (memberError) {
      console.error("Member creation error:", memberError);
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      return res.status(500).json({ error: "Failed to add user to workspace" });
    }

    // Migrate existing posts
    await supabase
      .from('posts')
      .update({ workspace_id: workspace.id })
      .eq('user_id', userId)
      .is('workspace_id', null);

    // Migrate existing connected accounts
    await supabase
      .from('connected_accounts')
      .update({ workspace_id: workspace.id })
      .eq('user_id', userId)
      .is('workspace_id', null);

    // Update user's last_workspace_id
    await supabase
      .from('user_profiles')
      .update({ last_workspace_id: workspace.id })
      .eq('id', userId);

    res.json({
      success: true,
      migrated: true,
      workspace: workspace
    });

  } catch (error) {
    console.error("Error migrating user:", error);
    res.status(500).json({ error: "Failed to migrate user to workspace" });
  }
});

// Create new workspace (with new Ayrshare profile)
app.post("/api/workspace/create", async (req, res) => {
  try {
    const { userId, businessName } = req.body;

    if (!userId || !businessName) {
      return res.status(400).json({ error: "userId and businessName are required" });
    }

    // Create new Ayrshare profile for this business
    let ayrProfileKey = null;
    let ayrRefId = null;

    if (env.AYRSHARE_API_KEY && env.AYRSHARE_PRIVATE_KEY) {
      const privateKey = await readPrivateKey(env.AYRSHARE_PRIVATE_KEY);

      if (privateKey) {
        try {
          const profileResponse = await axios.post(
            `${BASE_AYRSHARE}/profiles/profile`,
            {
              title: businessName,
              privateKey: privateKey
            },
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.AYRSHARE_API_KEY}`
              }
            }
          );

          ayrProfileKey = profileResponse.data.profileKey;
          ayrRefId = profileResponse.data.refId;
          console.log("Created Ayrshare profile:", { ayrProfileKey, ayrRefId });
        } catch (ayrError) {
          console.error("Ayrshare profile creation error:", ayrError.response?.data || ayrError.message);
        }
      }
    }

    // Create workspace
    const slug = generateSlug(businessName);

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: businessName,
        slug: slug,
        ayr_profile_key: ayrProfileKey,
        ayr_ref_id: ayrRefId
      })
      .select()
      .single();

    if (workspaceError) {
      console.error("Workspace creation error:", workspaceError);
      return res.status(500).json({ error: "Failed to create workspace" });
    }

    // Add user as owner with full permissions
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner',
        can_manage_team: true,
        can_manage_settings: true,
        can_delete_posts: true
      });

    if (memberError) {
      console.error("Member creation error:", memberError);
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      return res.status(500).json({ error: "Failed to add user to workspace" });
    }

    // Update user's last_workspace_id
    await supabase
      .from('user_profiles')
      .update({ last_workspace_id: workspace.id })
      .eq('id', userId);

    res.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        ayr_profile_key: workspace.ayr_profile_key
      }
    });

  } catch (error) {
    console.error("Error creating workspace:", error);
    res.status(500).json({ error: "Failed to create workspace" });
  }
});

// ============================================================
// STRIPE PAYMENT ENDPOINTS
// ============================================================

// Create Checkout Session
app.post("/api/stripe/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const { userId, tier } = req.body;

    if (!userId || !tier) {
      return res.status(400).json({ error: "userId and tier are required" });
    }

    // Validate tier
    if (!STRIPE_PRICE_IDS.hasOwnProperty(tier)) {
      return res.status(400).json({
        error: `Invalid tier: ${tier}. Valid tiers: ${Object.keys(STRIPE_PRICE_IDS).join(", ")}`
      });
    }

    const priceId = STRIPE_PRICE_IDS[tier];
    if (!priceId) {
      return res.status(500).json({ error: `Price not configured for tier: ${tier}` });
    }

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, stripe_customer_id")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      console.error("User fetch error:", userError);
      return res.status(404).json({ error: "User not found" });
    }

    // Get or create Stripe customer
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.full_name,
        metadata: {
          supabase_user_id: userId,
        },
      });
      customerId = customer.id;

      // Save customer ID to database
      await supabase
        .from("user_profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    // Create checkout session
    const appUrl = env.APP_URL || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${appUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?payment=cancelled`,
      subscription_data: {
        metadata: {
          supabase_user_id: userId,
          tier: tier,
        },
      },
      metadata: {
        supabase_user_id: userId,
        tier: tier,
      },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    console.log("Checkout session created:", session.id);

    return res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return res.status(500).json({ error: "Failed to create checkout session", details: error.message });
  }
});

// Customer Portal
app.post("/api/stripe/customer-portal", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const { userId, returnUrl } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from("user_profiles")
      .select("id, email, stripe_customer_id")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: "No subscription found. Please subscribe first." });
    }

    // Create portal session
    const appUrl = env.APP_URL || "http://localhost:5173";

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: returnUrl || `${appUrl}/settings`,
    });

    return res.json({
      success: true,
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    console.error("Stripe portal error:", error);
    return res.status(500).json({ error: "Failed to create portal session", details: error.message });
  }
});

// Stripe Webhook (for local testing - production uses Vercel serverless)
app.post("/api/stripe/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("Webhook secret not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    console.log(`[WEBHOOK] Received event: ${event.type}`);

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const tier = session.metadata?.tier;

        if (userId) {
          // Update user subscription status
          await supabase
            .from("user_profiles")
            .update({
              subscription_status: "active",
              subscription_tier: tier,
              stripe_subscription_id: session.subscription,
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId);

          console.log(`[WEBHOOK] User ${userId} subscription activated: ${tier}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

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

          console.log(`[WEBHOOK] User ${user.id} subscription cancelled`);
        }
        break;
      }

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
});

const PORT = env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (stripe) {
    console.log("Stripe integration enabled");
  } else {
    console.warn("WARNING: Stripe not configured - payment features disabled");
  }
});
