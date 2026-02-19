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

const allowedOrigins = [
  'https://www.woozysocials.com',
  'https://api.woozysocial.com',
  'http://localhost:5173',
  'http://localhost:3000'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // For now, allow all origins for maximum compatibility
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
};

const app = express();
app.use(cors(corsOptions));
const upload = multer({ dest: "uploads/" });

// Additional CORS middleware for explicit header control
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Set the origin header based on the request
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  } else if (origin) {
    // Allow other origins for development/testing
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }

  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  // Handle preflight requests
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
// Helper to check if workspace has client members who need to approve
async function workspaceHasClients(workspaceId) {
  if (!workspaceId) return false;

  try {
    // Check for both 'view_only' and 'client' roles (database may use either)
    const { data: clients, error } = await supabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', workspaceId)
      .in('role', ['view_only', 'client'])
      .limit(1);

    console.log(`[workspaceHasClients] workspaceId: ${workspaceId}, clients found:`, clients, 'error:', error);

    return clients && clients.length > 0;
  } catch (error) {
    console.error('Error checking workspace clients:', error);
    return false;
  }
}

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

    const isScheduled = !!scheduledDate;

    // Check if workspace has clients who need to approve scheduled posts
    const hasClients = await workspaceHasClients(workspaceId);
    const requiresApproval = isScheduled && hasClients;

    console.log(`[POST] isScheduled: ${isScheduled}, hasClients: ${hasClients}, requiresApproval: ${requiresApproval}`);

    // If scheduled and has clients, save to DB only - wait for approval
    if (requiresApproval) {
      // Handle media URL from upload or existing
      let finalMediaUrl = mediaUrl;
      if (media) {
        try {
          finalMediaUrl = await uploadMediaToAyrshare(media);
        } catch (error) {
          console.error("Failed to upload media:", error);
          return res.status(500).json({
            error: "Failed to upload media",
            details: error.response?.data || error.message
          });
        }
      }

      const { data: savedPost, error: saveError } = await supabase.from("posts").insert([{
        user_id: userId,
        workspace_id: workspaceId,
        created_by: userId,
        caption: text,
        media_urls: finalMediaUrl ? [finalMediaUrl] : [],
        status: 'pending_approval',
        scheduled_at: new Date(scheduledDate).toISOString(),
        platforms: platforms,
        approval_status: 'pending',
        requires_approval: true
      }]).select().single();

      if (saveError) {
        console.error('Error saving post for approval:', saveError);
        return res.status(500).json({
          success: false,
          error: "Failed to save post for approval",
          details: saveError.message
        });
      }

      console.log(`[POST] Post saved for approval with ID: ${savedPost?.id}`);

      return res.status(200).json({
        success: true,
        status: 'pending_approval',
        message: 'Post saved and awaiting client approval',
        postId: savedPost?.id
      });
    }

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

    // If requires approval, save to DB and wait for client approval
    if (requiresApproval) {
      const { data: savedPost, error: saveError } = await supabase.from("posts").insert([{
        user_id: userId,
        workspace_id: workspaceId,
        created_by: userId,
        caption: text,
        media_urls: postData.mediaUrls || [],
        status: 'pending_approval',
        scheduled_at: new Date(scheduledDate).toISOString(),
        platforms: platforms,
        approval_status: 'pending',
        requires_approval: true
      }]).select().single();

      if (saveError) {
        console.error("Error saving post for approval:", saveError);
        return res.status(500).json({
          error: "Failed to save post for approval",
          details: saveError.message
        });
      }

      console.log("Post saved for client approval:", savedPost?.id);
      return res.status(200).json({
        status: 'pending_approval',
        message: 'Post saved and awaiting client approval',
        postId: savedPost?.id
      });
    }

    // No approval needed - send directly to Ayrshare
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

      // Save failed post to database
      await supabase.from("posts").insert([{
        user_id: userId,
        workspace_id: workspaceId,
        created_by: userId,
        caption: text,
        media_urls: postData.mediaUrls || [],
        status: 'failed',
        scheduled_at: isScheduled ? new Date(scheduledDate).toISOString() : null,
        platforms: platforms,
        last_error: response.data.posts?.[0]?.message || 'Post failed'
      }]);

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

    // Save successful post to database
    const ayrPostId = response.data.id || response.data.postId;
    await supabase.from("posts").insert([{
      user_id: userId,
      workspace_id: workspaceId,
      created_by: userId,
      ayr_post_id: ayrPostId,
      caption: text,
      media_urls: postData.mediaUrls || [],
      status: isScheduled ? 'scheduled' : 'posted',
      scheduled_at: isScheduled ? new Date(scheduledDate).toISOString() : null,
      posted_at: isScheduled ? null : new Date().toISOString(),
      platforms: platforms,
      approval_status: 'approved',
      requires_approval: false
    }]);

    console.log("Post saved to database, ayr_post_id:", ayrPostId);

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
    const { userId, workspaceId, lastDays } = req.query;

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

    // Fetch from Ayrshare
    let ayrshareHistory = [];
    try {
      const historyParams = {};
      if (lastDays && !isNaN(Number(lastDays))) {
        historyParams.lastDays = Number(lastDays);
      }
      const response = await axios.get(`${BASE_AYRSHARE}/history`, {
        params: historyParams,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey
        }
      });
      ayrshareHistory = response.data.history || [];
    } catch (ayrError) {
      console.error("Error fetching from Ayrshare:", ayrError.response?.data || ayrError.message);
      // Continue with empty Ayrshare history
    }

    // Fetch pending approval posts from Supabase
    let supabasePosts = [];
    if (workspaceId) {
      const { data: dbPosts, error: dbError } = await supabase
        .from('posts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (!dbError && dbPosts) {
        supabasePosts = dbPosts.map(post => ({
          id: post.id,
          post: post.caption,
          platforms: post.platforms || [],
          scheduleDate: post.scheduled_at,
          status: post.status === 'pending_approval' ? 'scheduled' : post.status,
          type: post.scheduled_at ? 'schedule' : 'post',
          mediaUrls: post.media_urls || [],
          approval_status: post.approval_status || 'pending',
          requires_approval: post.requires_approval || false,
          comments: [],
          created_at: post.created_at,
          // Mark as from DB so frontend knows it's a local post
          source: 'database',
          ayr_post_id: post.ayr_post_id
        }));
      }
    }

    // Merge: Supabase posts that are pending approval + Ayrshare history
    // Avoid duplicates by checking ayr_post_id
    const ayrPostIds = new Set(ayrshareHistory.map(p => p.id));
    const pendingPosts = supabasePosts.filter(p =>
      p.approval_status === 'pending' ||
      p.approval_status === 'rejected' ||
      !p.ayr_post_id ||
      !ayrPostIds.has(p.ayr_post_id)
    );

    // Add approval status to Ayrshare posts from DB
    const enrichedAyrshare = ayrshareHistory.map(ayrPost => {
      const dbPost = supabasePosts.find(p => p.ayr_post_id === ayrPost.id);
      return {
        ...ayrPost,
        approval_status: dbPost?.approval_status || 'approved',
        requires_approval: dbPost?.requires_approval || false,
        comments: dbPost?.comments || []
      };
    });

    const allHistory = [...pendingPosts, ...enrichedAyrshare];

    res.status(200).json({
      history: allHistory,
      count: allHistory.length
    });
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

// Update user profile (for app tour completion, etc.)
app.post("/api/user/update-profile", async (req, res) => {
  try {
    const { userId, updates } = req.body;
    if (!userId || !updates) {
      return res.status(400).json({ error: "userId and updates are required" });
    }

    const ALLOWED_FIELDS = ['app_tour_completed', 'full_name', 'avatar_url'];
    const safeUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED_FIELDS.includes(key)) safeUpdates[key] = value;
    }

    if (Object.keys(safeUpdates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const { error } = await supabase
      .from('user_profiles')
      .update(safeUpdates)
      .eq('id', userId);

    if (error) throw error;
    res.json({ success: true, updated: Object.keys(safeUpdates) });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
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

// Delete a post - supports both Ayrshare post ID and database ID
app.delete("/api/post/delete", requireActiveProfile, async (req, res) => {
  try {
    let { postId, databaseId, workspaceId } = req.body;

    if (!postId && !databaseId) {
      return res.status(400).json({ error: "postId or databaseId is required" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    // If we have a databaseId but no Ayrshare postId, look it up
    if (!postId && databaseId) {
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

    // Get workspace's profile key
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) profileKey = workspaceProfileKey;
    }

    // Delete from Ayrshare if we have an Ayrshare ID
    let ayrshareDeleted = false;
    if (postId) {
      try {
        await axios.delete(`${BASE_AYRSHARE}/post`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey
          },
          data: { id: postId }
        });
        ayrshareDeleted = true;
      } catch (ayrErr) {
        if (ayrErr.response?.status === 404) {
          ayrshareDeleted = true; // Already deleted
        } else {
          console.warn("[DELETE POST] Ayrshare deletion failed:", ayrErr.response?.data || ayrErr.message);
        }
      }
    } else {
      ayrshareDeleted = true; // No Ayrshare ID, skip
    }

    // Delete from database
    let deleteQuery = supabase.from('posts').delete().eq('workspace_id', workspaceId);
    if (databaseId) {
      deleteQuery = deleteQuery.eq('id', databaseId);
    } else if (postId) {
      deleteQuery = deleteQuery.eq('ayr_post_id', postId);
    }
    await deleteQuery;

    res.json({
      success: true,
      message: "Post deleted successfully",
      deletedFromAyrshare: ayrshareDeleted
    });
  } catch (error) {
    console.error("Error deleting post:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to delete post",
      details: error.response?.data || error.message
    });
  }
});

// Legacy delete route (kept for backwards compat)
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

// =====================================================
// POST APPROVAL ROUTES
// =====================================================

// Get pending approvals
app.get("/api/post/pending-approvals", async (req, res) => {
  try {
    const { workspaceId, userId, status } = req.query;

    if (!workspaceId || !userId) {
      return res.status(400).json({ success: false, error: "workspaceId and userId are required" });
    }

    // Verify user is a member of the workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      console.error('Error checking membership:', membershipError);
    }

    if (!membership) {
      return res.status(403).json({ success: false, error: "You are not a member of this workspace" });
    }

    // Build query for posts (removed invalid user_profiles join)
    let query = supabase
      .from('posts')
      .select(`
        id,
        caption,
        platforms,
        media_urls,
        scheduled_at,
        status,
        approval_status,
        requires_approval,
        created_at,
        user_id,
        created_by,
        post_approvals (
          approval_status,
          reviewed_at,
          reviewed_by
        ),
        post_comments (
          id
        )
      `)
      .eq('workspace_id', workspaceId)
      .order('scheduled_at', { ascending: true });

    // Filter by approval status if provided
    if (status && status !== 'all') {
      query = query.eq('approval_status', status);
    } else if (!status) {
      // Default to showing posts that need action (pending or changes_requested)
      query = query.in('approval_status', ['pending', 'changes_requested']);
    }
    // If status === 'all', don't filter by approval_status

    // Show posts that are pending approval or scheduled
    query = query.in('status', ['pending_approval', 'scheduled']);

    const { data: posts, error } = await query;

    if (error) {
      console.error('Error fetching pending approvals:', error);
      return res.status(500).json({ success: false, error: "Failed to fetch pending approvals" });
    }

    // Fetch creator info for all posts
    const creatorIds = [...new Set((posts || []).map(p => p.created_by || p.user_id).filter(Boolean))];
    let creatorProfiles = {};

    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', creatorIds);

      if (profiles) {
        creatorProfiles = profiles.reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    // Add comment count, creator info, and map fields for frontend
    const postsWithMeta = (posts || []).map(post => {
      const creatorId = post.created_by || post.user_id;
      const creator = creatorProfiles[creatorId] || null;
      return {
        ...post,
        post: post.caption,
        schedule_date: post.scheduled_at,
        media_url: post.media_urls?.[0] || null,
        commentCount: post.post_comments?.length || 0,
        post_comments: undefined,
        user_profiles: creator,
        creator_name: creator?.full_name || creator?.email || 'Unknown'
      };
    });

    // Group by approval status
    const grouped = {
      pending: postsWithMeta.filter(p => p.approval_status === 'pending'),
      changes_requested: postsWithMeta.filter(p => p.approval_status === 'changes_requested'),
      approved: postsWithMeta.filter(p => p.approval_status === 'approved'),
      rejected: postsWithMeta.filter(p => p.approval_status === 'rejected')
    };

    res.json({
      success: true,
      data: {
        posts: postsWithMeta,
        grouped: grouped,
        counts: {
          pending: grouped.pending.length,
          changes_requested: grouped.changes_requested.length,
          approved: grouped.approved.length,
          rejected: grouped.rejected.length,
          total: postsWithMeta.length
        },
        userRole: membership.role
      }
    });
  } catch (error) {
    console.error("Error in pending-approvals:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pending approvals" });
  }
});

// Approve, reject, or request changes for a post
app.post("/api/post/approve", async (req, res) => {
  try {
    const { postId, workspaceId, userId, action, comment } = req.body;

    if (!postId || !workspaceId || !userId || !action) {
      return res.status(400).json({ success: false, error: "postId, workspaceId, userId, and action are required" });
    }

    const validActions = ['approve', 'reject', 'changes_requested'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    }

    // Verify user is a member of the workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      console.error('Error checking membership:', membershipError);
    }

    if (!membership) {
      return res.status(403).json({ success: false, error: "You are not a member of this workspace" });
    }

    // Map action to status
    const statusMap = {
      'approve': 'approved',
      'reject': 'rejected',
      'changes_requested': 'changes_requested'
    };
    const newStatus = statusMap[action];

    // Update or create post approval record
    const { data: existingApproval, error: approvalError } = await supabase
      .from('post_approvals')
      .select('id')
      .eq('post_id', postId)
      .single();

    if (approvalError && approvalError.code !== 'PGRST116') {
      console.error('Error checking approval:', approvalError);
    }

    const approvalData = {
      approval_status: newStatus,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (existingApproval) {
      await supabase
        .from('post_approvals')
        .update(approvalData)
        .eq('id', existingApproval.id);
    } else {
      await supabase
        .from('post_approvals')
        .insert({
          post_id: postId,
          workspace_id: workspaceId,
          ...approvalData
        });
    }

    // Update the post's approval_status
    await supabase
      .from('posts')
      .update({ approval_status: newStatus })
      .eq('id', postId);

    // If approved, send the post to Ayrshare
    if (action === 'approve') {
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

      if (postError) {
        console.error('Error fetching post:', postError);
        return res.status(500).json({ success: false, error: "Failed to fetch post data" });
      }

      if (post && post.status === 'pending_approval') {
        // Get workspace profile key
        const { data: workspace } = await supabase
          .from('workspaces')
          .select('ayr_profile_key')
          .eq('id', workspaceId)
          .single();

        const profileKey = workspace?.ayr_profile_key || env.AYRSHARE_PROFILE_KEY;

        if (!profileKey) {
          return res.status(400).json({ success: false, error: "No social media profile found for this workspace" });
        }

        try {
          // Build post data for Ayrshare
          const postData = {
            post: post.caption,
            platforms: post.platforms
          };

          // Check if scheduled time is in the future
          if (post.scheduled_at) {
            const scheduledTime = new Date(post.scheduled_at);
            const now = new Date();

            console.log('[approve] Schedule check:', {
              scheduled_at_raw: post.scheduled_at,
              scheduledTime: scheduledTime.toISOString(),
              now: now.toISOString(),
              isInFuture: scheduledTime > now,
              diffMs: scheduledTime.getTime() - now.getTime()
            });

            if (scheduledTime > now) {
              // CRITICAL: Ayrshare expects ISO-8601 string format, NOT Unix timestamp!
              postData.scheduleDate = scheduledTime.toISOString();
              console.log('[approve] Adding scheduleDate:', postData.scheduleDate);
            } else {
              console.log('[approve] Scheduled time has passed, posting immediately');
            }
          }

          if (post.media_urls && post.media_urls.length > 0) {
            postData.mediaUrls = post.media_urls;
          }

          console.log('[approve] Sending post data to Ayrshare:', JSON.stringify(postData, null, 2));

          const ayrshareResponse = await axios.post(`${BASE_AYRSHARE}/post`, postData, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
              "Profile-Key": profileKey
            },
            timeout: 30000
          });

          console.log('[approve] Ayrshare response:', JSON.stringify(ayrshareResponse.data, null, 2));

          if (ayrshareResponse.data.status !== 'error') {
            // Ayrshare returns different structures for scheduled vs immediate posts
            // Scheduled posts: { status: 'success', posts: [{ id: '...', ... }] }
            // Immediate posts: { status: 'success', id: '...', ... }
            let ayrPostId;
            if (ayrshareResponse.data.posts && Array.isArray(ayrshareResponse.data.posts) && ayrshareResponse.data.posts.length > 0) {
              // For scheduled posts, extract from posts array
              ayrPostId = ayrshareResponse.data.posts[0].id;
            } else {
              // For immediate posts, extract from root level
              ayrPostId = ayrshareResponse.data.id || ayrshareResponse.data.postId || ayrshareResponse.data.scheduleId;
            }

            const scheduledTime = new Date(post.scheduled_at);
            const now = new Date();
            const isStillFuture = scheduledTime > now;

            console.log('[approve] Extracted ayrPostId:', ayrPostId, 'isStillFuture:', isStillFuture);

            if (!ayrPostId) {
              console.error('[approve] WARNING: No post ID returned from Ayrshare!', ayrshareResponse.data);
            }

            await supabase
              .from('posts')
              .update({
                ayr_post_id: ayrPostId || null,
                status: isStillFuture ? 'scheduled' : 'posted',
                posted_at: isStillFuture ? null : new Date().toISOString()
              })
              .eq('id', postId);
          } else {
            await supabase
              .from('posts')
              .update({
                status: 'failed',
                last_error: ayrshareResponse.data.message || 'Failed to post to Ayrshare'
              })
              .eq('id', postId);

            return res.status(500).json({
              success: false,
              error: "Failed to post to social platforms",
              details: ayrshareResponse.data
            });
          }
        } catch (ayrError) {
          console.error('Ayrshare error:', ayrError.response?.data || ayrError.message);
          await supabase
            .from('posts')
            .update({
              status: 'failed',
              last_error: ayrError.response?.data?.message || ayrError.message
            })
            .eq('id', postId);

          return res.status(500).json({
            success: false,
            error: "Failed to send post to social platforms",
            details: ayrError.response?.data
          });
        }
      }
    }

    // Add system comment
    const systemComment = comment || `Post ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'marked for changes'}`;

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const userName = userProfile?.full_name || userProfile?.email || 'User';

    await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        workspace_id: workspaceId,
        user_id: userId,
        comment: `${userName}: ${systemComment}`,
        is_system: true
      });

    const actionMessages = {
      'approve': 'approved',
      'reject': 'rejected',
      'changes_requested': 'marked for changes'
    };

    res.json({
      success: true,
      data: {
        status: newStatus,
        message: `Post ${actionMessages[action]}`
      }
    });
  } catch (error) {
    console.error("Error in post approve:", error);
    res.status(500).json({ success: false, error: "Failed to update approval status" });
  }
});

// Get approval status and comments for a post
app.get("/api/post/approve", async (req, res) => {
  try {
    const { postId } = req.query;

    if (!postId) {
      return res.status(400).json({ success: false, error: "postId is required" });
    }

    // Get approval record
    const { data: approval, error: approvalError } = await supabase
      .from('post_approvals')
      .select(`
        id,
        approval_status,
        reviewed_at,
        reviewed_by,
        user_profiles!reviewed_by (
          full_name,
          email
        )
      `)
      .eq('post_id', postId)
      .single();

    if (approvalError && approvalError.code !== 'PGRST116') {
      console.error('Error fetching approval:', approvalError);
    }

    // Get comments
    const { data: comments, error: commentsError } = await supabase
      .from('post_comments')
      .select(`
        id,
        comment,
        is_system,
        created_at,
        user_id,
        user_profiles (
          full_name,
          email,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (commentsError) {
      console.error('Error fetching comments:', commentsError);
    }

    res.json({
      success: true,
      data: {
        approval: approval || { approval_status: 'pending' },
        comments: comments || []
      }
    });
  } catch (error) {
    console.error("Error fetching approval status:", error);
    res.status(500).json({ success: false, error: "Failed to fetch approval status" });
  }
});

// Post comments endpoint
app.get("/api/post/comment", async (req, res) => {
  try {
    const { postId } = req.query;

    if (!postId) {
      return res.status(400).json({ success: false, error: "postId is required" });
    }

    const { data: comments, error } = await supabase
      .from('post_comments')
      .select(`
        id,
        comment,
        is_system,
        created_at,
        user_id,
        user_profiles (
          full_name,
          email,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching comments:', error);
      return res.status(500).json({ success: false, error: "Failed to fetch comments" });
    }

    res.json({ success: true, data: { comments: comments || [] } });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ success: false, error: "Failed to fetch comments" });
  }
});

app.post("/api/post/comment", async (req, res) => {
  try {
    const { postId, workspaceId, userId, comment } = req.body;

    if (!postId || !workspaceId || !userId || !comment) {
      return res.status(400).json({ success: false, error: "postId, workspaceId, userId, and comment are required" });
    }

    const { data: newComment, error } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        workspace_id: workspaceId,
        user_id: userId,
        comment: comment.trim(),
        is_system: false
      })
      .select(`
        id,
        comment,
        is_system,
        created_at,
        user_id,
        user_profiles (
          full_name,
          email,
          avatar_url
        )
      `)
      .single();

    if (error) {
      console.error('Error adding comment:', error);
      return res.status(500).json({ success: false, error: "Failed to add comment" });
    }

    res.json({ success: true, data: { comment: newComment } });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ success: false, error: "Failed to add comment" });
  }
});

// =====================================================
// END POST APPROVAL ROUTES
// =====================================================

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
    const aiResponse = await axios.post(
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

    const hashtagText = aiResponse.data.choices[0]?.message?.content || '';
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
    const aiResponse = await axios.post(
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

    const generatedText = aiResponse.data.choices[0]?.message?.content || '';

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
          from: 'Woozy Social <hello@woozysocials.com>',
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

// Cancel workspace invitation
app.post("/api/workspace/cancel-invite", async (req, res) => {
  try {
    const { inviteId, workspaceId, userId } = req.body;

    if (!inviteId || !userId) {
      return res.status(400).json({ error: "inviteId and userId are required" });
    }

    // Get the invitation
    const { data: invite, error: inviteError } = await supabase
      .from('workspace_invitations')
      .select('id, workspace_id, status')
      .eq('id', inviteId)
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // If workspaceId provided, verify it matches
    if (workspaceId && invite.workspace_id !== workspaceId) {
      return res.status(403).json({ error: 'Invitation does not belong to this workspace' });
    }

    // Check if user has permission to cancel (must be owner/admin of workspace)
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', invite.workspace_id)
      .eq('user_id', userId)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Not authorized to cancel this invitation' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invitations can be cancelled' });
    }

    // Cancel the invitation
    const { error: cancelError } = await supabase
      .from('workspace_invitations')
      .update({ status: 'cancelled' })
      .eq('id', inviteId);

    if (cancelError) {
      console.error('Error canceling invitation:', cancelError);
      return res.status(500).json({ error: 'Failed to cancel invitation' });
    }

    return res.json({ success: true, data: { message: 'Invitation cancelled successfully' } });
  } catch (error) {
    console.error('Error canceling invitation:', error);
    return res.status(500).json({ error: 'Failed to cancel invitation' });
  }
});

// Role-based permission defaults
const ROLE_PERMISSIONS = {
  owner: { can_manage_team: true, can_manage_settings: true, can_delete_posts: true, can_approve_posts: true },
  admin: { can_manage_team: true, can_manage_settings: true, can_delete_posts: true, can_approve_posts: true },
  editor: { can_manage_team: false, can_manage_settings: false, can_delete_posts: true, can_approve_posts: false },
  view_only: { can_manage_team: false, can_manage_settings: false, can_delete_posts: false, can_approve_posts: false },
  client: { can_manage_team: false, can_manage_settings: false, can_delete_posts: false, can_approve_posts: true }
};

// Validate workspace invitation (public - no auth required)
app.get("/api/workspace/validate-invite", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    // Get the invitation by invite_token
    const { data: invitation, error: inviteError } = await supabase
      .from('workspace_invitations')
      .select(`
        id,
        workspace_id,
        email,
        role,
        status,
        invited_at,
        expires_at,
        workspaces (
          id,
          name,
          slug,
          logo_url
        )
      `)
      .eq('invite_token', token)
      .single();

    if (inviteError || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Check if invitation is still valid
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: `Invitation has already been ${invitation.status}` });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('workspace_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    return res.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        invited_at: invitation.invited_at,
        expires_at: invitation.expires_at,
        workspace: invitation.workspaces
      }
    });
  } catch (error) {
    console.error('Error validating invitation:', error);
    return res.status(500).json({ error: 'Failed to validate invitation' });
  }
});

// Accept workspace invitation
app.post("/api/workspace/accept-invite", async (req, res) => {
  try {
    const { inviteToken, userId } = req.body;

    if (!inviteToken || !userId) {
      return res.status(400).json({ error: "inviteToken and userId are required" });
    }

    // Get the invitation by invite_token
    const { data: invitation, error: inviteError } = await supabase
      .from('workspace_invitations')
      .select(`
        id,
        workspace_id,
        email,
        role,
        status,
        expires_at,
        workspaces (
          id,
          name,
          slug,
          logo_url
        )
      `)
      .eq('invite_token', inviteToken)
      .single();

    if (inviteError || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Check if invitation is still valid
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: `Invitation has already been ${invitation.status}` });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('workspace_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // Get user's email to verify
    const { data: userData } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (userData?.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', invitation.workspace_id)
      .eq('user_id', userId)
      .single();

    if (existingMember) {
      await supabase
        .from('workspace_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id);
      return res.json({ success: true, data: { message: 'You are already a member of this workspace', workspace: invitation.workspaces } });
    }

    // Add user to workspace with role-based permissions
    const permissions = ROLE_PERMISSIONS[invitation.role] || ROLE_PERMISSIONS.editor;
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: invitation.workspace_id,
        user_id: userId,
        role: invitation.role,
        can_manage_team: permissions.can_manage_team,
        can_manage_settings: permissions.can_manage_settings,
        can_delete_posts: permissions.can_delete_posts,
        can_approve_posts: permissions.can_approve_posts
      });

    if (memberError) {
      console.error('Error adding workspace member:', memberError);
      return res.status(500).json({ error: 'Failed to add you to the workspace' });
    }

    // Update invitation status
    await supabase
      .from('workspace_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    // Update user's last workspace
    await supabase
      .from('user_profiles')
      .update({ last_workspace_id: invitation.workspace_id })
      .eq('id', userId);

    return res.json({ success: true, data: { message: 'Successfully joined the workspace', workspace: invitation.workspaces } });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return res.status(500).json({ error: 'Failed to accept invitation' });
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

    // Update member with role-based permissions
    const updateData = {};
    if (role) {
      updateData.role = role;
      // Apply default permissions for the new role
      const rolePerms = ROLE_PERMISSIONS[role];
      if (rolePerms) {
        updateData.can_manage_team = rolePerms.can_manage_team;
        updateData.can_manage_settings = rolePerms.can_manage_settings;
        updateData.can_delete_posts = rolePerms.can_delete_posts;
        updateData.can_approve_posts = rolePerms.can_approve_posts;
      }
    }
    // Allow explicit permission overrides if provided
    if (permissions) {
      if (typeof permissions.canManageTeam === 'boolean') updateData.can_manage_team = permissions.canManageTeam;
      if (typeof permissions.canManageSettings === 'boolean') updateData.can_manage_settings = permissions.canManageSettings;
      if (typeof permissions.canDeletePosts === 'boolean') updateData.can_delete_posts = permissions.canDeletePosts;
      if (typeof permissions.canApprovePosts === 'boolean') updateData.can_approve_posts = permissions.canApprovePosts;
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
          console.error("[WEBHOOK] Error updating user profile:", updateError);
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

          // Create Ayrshare profile
          try {
            const axios = require("axios");
            const response = await axios.post(
              "https://api.ayrshare.com/api/profiles/profile",
              {
                title: existingWorkspace.name || workspaceName,
              },
              {
                headers: {
                  Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              }
            );

            if (response.data && response.data.profileKey) {
              console.log(`[WEBHOOK] Created Ayrshare profile: ${response.data.profileKey}, refId: ${response.data.refId}`);

              // Update workspace with profile key AND ref id
              const { data: workspace, error: workspaceError } = await supabase
                .from("workspaces")
                .update({
                  ayr_profile_key: response.data.profileKey,
                  ayr_ref_id: response.data.refId,
                  subscription_tier: tier,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingWorkspace.id)
                .select()
                .single();

              if (workspaceError) {
                console.error("[WEBHOOK] Error updating workspace:", workspaceError);
              } else {
                console.log(`[WEBHOOK] Updated workspace ${workspace.id} with profile key and ref id`);
              }
            } else {
              console.error("[WEBHOOK] No profileKey in Ayrshare response");
            }
          } catch (error) {
            console.error("[WEBHOOK] Error creating Ayrshare profile:", error.message);
          }
        } else {
          // User has NO workspaces at all - CREATE new one
          console.log(`[WEBHOOK] User ${userId} has no workspaces, creating new one`);

          // Create Ayrshare profile
          try {
            const axios = require("axios");
            const response = await axios.post(
              "https://api.ayrshare.com/api/profiles/profile",
              {
                title: workspaceName,
              },
              {
                headers: {
                  Authorization: `Bearer ${env.AYRSHARE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              }
            );

            if (response.data && response.data.profileKey) {
              console.log(`[WEBHOOK] Created Ayrshare profile: ${response.data.profileKey}, refId: ${response.data.refId}`);

              // Create workspace with profile key AND ref id
              const { data: workspace, error: workspaceError } = await supabase
                .from("workspaces")
                .insert({
                  name: workspaceName,
                  ayr_profile_key: response.data.profileKey,
                  ayr_ref_id: response.data.refId,
                  subscription_tier: tier,
                  created_from_payment: true,
                  created_at: new Date().toISOString(),
                })
                .select()
                .single();

              if (workspaceError) {
                console.error("[WEBHOOK] Error creating workspace:", workspaceError);
              } else {
                // Add user as owner of the workspace
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
                  console.error("[WEBHOOK] Error creating workspace member:", memberError);
                } else {
                  console.log(`[WEBHOOK] Created workspace ${workspace.id} with profile key and ref id for user ${userId}`);
                }
              }
            } else {
              console.error("[WEBHOOK] No profileKey in Ayrshare response");
            }
          } catch (error) {
            console.error("[WEBHOOK] Error creating Ayrshare profile:", error.message);
          }
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
