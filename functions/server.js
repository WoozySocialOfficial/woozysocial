import express from "express";
import multer from "multer";
import axios from "axios";
import { config } from "dotenv";
import { env } from "process";
import fs from "fs";
import FormData from "form-data";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

config(); // Load environment variables

// Initialize Supabase client
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

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
    const { text, networks, scheduledDate, userId, mediaUrl } = req.body;
    const media = req.file;

    // Get user's profile key from database, or fall back to env variable
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (userId) {
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
    const { userId } = req.query;

    // Get user's profile key from database, or fall back to env variable
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (userId) {
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
    const { userId } = req.query;

    // Get user's profile key from database, or fall back to env variable
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (userId) {
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
    const { userId } = req.query;

    console.log(`[DIAGNOSTIC] /api/user-accounts called with userId: ${userId}`);

    // Get user's profile key from database, or fall back to env variable
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    console.log(`[DIAGNOSTIC] Default profile key from .env: ${profileKey}`);

    if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      console.log(`[DIAGNOSTIC] User profile key from database: ${userProfileKey}`);
      if (userProfileKey) {
        profileKey = userProfileKey;
        console.log(`[DIAGNOSTIC] Using user's profile key`);
      } else {
        console.log(`[DIAGNOSTIC] No user profile key found, falling back to .env`);
      }
    } else {
      console.log(`[DIAGNOSTIC] No userId provided, using .env profile key`);
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

    // Handle case where user has no connected accounts
    if (!displayNames || !Array.isArray(displayNames)) {
      return res.json({ activeSocialAccounts: [] });
    }

    const accountsWithUrls = displayNames.map((account) => ({
      name: account.platform,
      profileUrl: account.profileUrl
    }));

    res.json({ activeSocialAccounts: accountsWithUrls });
  } catch (error) {
    console.error(
      "Error fetching user accounts:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch user accounts" });
  }
});

// Helper function to get user's profile key from database
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
    const { userId } = req.query;

    // Get user's profile key from database, or fall back to env variable
    let profileKey = env.AYRSHARE_PROFILE_KEY;
    if (userId) {
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
    const { userId, prompt, platforms } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Fetch brand profile from Supabase
    const { data: brandProfile, error: profileError } = await supabase
      .from('brand_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

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

    systemPrompt += `\n\nGenerate 3 variations of the post. Keep posts concise and engaging. Include relevant hashtags.`;

    // Call OpenAI API
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 500
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        }
      }
    );

    const generatedText = openaiResponse.data.choices[0].message.content;

    // Split variations if the AI provided multiple
    const variations = generatedText.split(/\n\n(?=\d+\.|\*\*Variation|\*Variation)/).filter(v => v.trim());

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

const PORT = env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
