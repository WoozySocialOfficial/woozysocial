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

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

config(); // Load environment variables

// Initialize Supabase client
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Initialize Resend client
const resend = new Resend(env.RESEND_API_KEY);

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

app.post("/api/post", upload.single("media"), async (req, res) => {
  try {
    const { text, networks, scheduledDate, userId, workspaceId, mediaUrl } = req.body;
    const media = req.file;

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

    const platforms = Object.entries(JSON.parse(networks))
      .filter(([, value]) => value)
      .map(([key]) => key);

    const postData = {
      post: text,
      platforms
    };

    if (scheduledDate) {
      // Ayrshare requires Unix timestamp in SECONDS (not milliseconds)
      // Parse the ISO string - it's already in UTC format from the client
      const dateObj = new Date(scheduledDate);
      const timestampSeconds = Math.floor(dateObj.getTime() / 1000);
      const currentTimeSeconds = Math.floor(Date.now() / 1000);
      const secondsUntilPost = timestampSeconds - currentTimeSeconds;

      console.log("=== SCHEDULING DEBUG ===");
      console.log("Schedule Date Input (ISO):", scheduledDate);
      console.log("Schedule Date Object:", dateObj.toISOString());
      console.log("Schedule Date Timestamp (seconds):", timestampSeconds);
      console.log("Current Time (seconds):", currentTimeSeconds);
      console.log("Time until post (seconds):", secondsUntilPost);
      console.log("Time until post (minutes):", (secondsUntilPost / 60).toFixed(2));
      console.log("Is in future?:", secondsUntilPost > 0);

      // Validate that the time is in the future
      if (secondsUntilPost <= 0) {
        console.error("ERROR: Scheduled time is in the past!");
        return res.status(400).json({
          error: "Scheduled time must be in the future",
          details: `Time difference: ${secondsUntilPost} seconds (must be positive)`
        });
      }

      // Ayrshare requires at least 10 minutes in the future for some platforms
      if (secondsUntilPost < 60) {
        console.warn("WARNING: Scheduled time is less than 1 minute in future");
      }

      postData.scheduleDate = timestampSeconds;
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

    console.log("Sending Data to Ayrshare:", JSON.stringify(postData, null, 2));

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

app.get("/api/post-history", async (req, res) => {
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

const readPrivateKey = async (privateKeyPath) => {
  try {
    let privateKey = await fs.readFileSync(privateKeyPath, {
      encoding: "utf8"
    });
    // Replace literal \n with actual newlines if they exist
    privateKey = privateKey.replace(/\\n/g, '\n');
    // Only trim trailing/leading whitespace, preserve internal newlines
    return privateKey.replace(/^\s+|\s+$/g, '');
  } catch (error) {
    console.error("Error reading private key file:", error);
    throw new Error("Failed to read private key file");
  }
};

// Updated endpoint to generate JWT URL with required parameters
app.get("/api/generate-jwt", async (req, res) => {
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

    const privateKey = await readPrivateKey(env.AYRSHARE_PRIVATE_KEY);

    const jwtData = {
      domain: env.AYRSHARE_DOMAIN,
      privateKey,
      profileKey: profileKey,
      verify: true,
      logout: true  // Force logout of any existing Ayrshare sessions in browser
    };

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

    res.json({ url: response.data.url });
  } catch (error) {
    console.error(
      "Error generating JWT URL:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to generate JWT URL" });
  }
});

// New endpoint to fetch user's active social accounts
app.get("/api/user-accounts", async (req, res) => {
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

// Helper function to get user's profile key from database (DEPRECATED - use getWorkspaceProfileKey)
async function getUserProfileKey(userId) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('ayr_profile_key')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data?.ayr_profile_key || null;
  } catch (error) {
    console.error('Error fetching user profile key:', error);
    return null;
  }
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
        ayr_ref_id: refId
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
app.get("/api/analytics/best-time", async (req, res) => {
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

    if (!membership || !membership.can_manage_team) {
      return res.status(403).json({ error: "You do not have permission to invite members" });
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', id)
      .eq('user_id', email) // This would need to be user ID, not email
      .single();

    if (existingMember) {
      return res.status(400).json({ error: "User is already a member of this workspace" });
    }

    // Generate invitation token
    const invitationToken = `${id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create invitation
    const { data: invitation, error } = await supabase
      .from('workspace_invitations')
      .insert({
        workspace_id: id,
        email,
        role: role || 'member',
        invited_by: userId,
        invitation_token: invitationToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      .select()
      .single();

    if (error) throw error;

    // TODO: Send invitation email
    console.log(`TODO: Send invitation email to ${email} with token ${invitationToken}`);

    res.json({ success: true, invitation });
  } catch (error) {
    console.error("Error inviting member:", error);
    res.status(500).json({ error: "Failed to invite member" });
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

    // Send email via Resend
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

const PORT = env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
