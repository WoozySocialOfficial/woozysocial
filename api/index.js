import express from "express";
import axios from "axios";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const BASE_AYRSHARE = "https://api.ayrshare.com/api";

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Resend client (optional - only if API key is provided)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const app = express();

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true
}));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

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

// ============================================================
// POST ENDPOINTS
// ============================================================

app.post("/api/post", async (req, res) => {
  try {
    const { text, networks, scheduledDate, userId, workspaceId, mediaUrl } = req.body;

    let profileKey = process.env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) profileKey = workspaceProfileKey;
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) profileKey = userProfileKey;
    }

    const platforms = Object.entries(JSON.parse(networks))
      .filter(([, value]) => value)
      .map(([key]) => key);

    const postData = { post: text, platforms };

    if (scheduledDate) {
      const dateObj = new Date(scheduledDate);
      const timestampSeconds = Math.floor(dateObj.getTime() / 1000);
      postData.scheduleDate = timestampSeconds;
    }

    if (mediaUrl) {
      postData.mediaUrls = [mediaUrl];
    }

    const response = await axios.post(`${BASE_AYRSHARE}/post`, postData, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    if (response.data.status === 'error') {
      return res.status(400).json({ error: "Post failed", details: response.data });
    }

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error posting:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to post", details: error.response?.data || error.message });
  }
});

app.get("/api/post-history", async (req, res) => {
  try {
    const { userId, workspaceId } = req.query;

    let profileKey = process.env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) profileKey = workspaceProfileKey;
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) profileKey = userProfileKey;
    }

    const response = await axios.get(`${BASE_AYRSHARE}/history`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error fetching post history:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch post history" });
  }
});

// ============================================================
// USER ACCOUNTS ENDPOINT
// ============================================================

app.get("/api/user-accounts", async (req, res) => {
  try {
    const { userId, workspaceId } = req.query;

    let profileKey = process.env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) profileKey = workspaceProfileKey;
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) profileKey = userProfileKey;
    }

    const response = await axios.get(`${BASE_AYRSHARE}/user`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey
      }
    });

    const { displayNames } = response.data;

    if (!displayNames || !Array.isArray(displayNames)) {
      return res.json({ accounts: [] });
    }

    const platformNames = displayNames.map((account) => account.platform);
    res.json({ accounts: platformNames });
  } catch (error) {
    console.error("Error fetching user accounts:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch user accounts" });
  }
});

// ============================================================
// JWT GENERATION
// ============================================================

app.get("/api/generate-jwt", async (req, res) => {
  try {
    const { userId, workspaceId } = req.query;

    let profileKey = process.env.AYRSHARE_PROFILE_KEY;
    if (workspaceId) {
      const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
      if (workspaceProfileKey) profileKey = workspaceProfileKey;
    } else if (userId) {
      const userProfileKey = await getUserProfileKey(userId);
      if (userProfileKey) profileKey = userProfileKey;
    }

    // Private key should be stored as environment variable in Vercel
    const privateKey = process.env.AYRSHARE_PRIVATE_KEY.replace(/\\n/g, '\n');

    const jwtData = {
      domain: process.env.AYRSHARE_DOMAIN,
      privateKey,
      profileKey: profileKey,
      verify: true,
      logout: true
    };

    const response = await axios.post(
      `${BASE_AYRSHARE}/profiles/generateJWT`,
      jwtData,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`
        }
      }
    );

    res.json({ url: response.data.url });
  } catch (error) {
    console.error("Error generating JWT URL:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to generate JWT URL" });
  }
});

// ============================================================
// AI POST GENERATION
// ============================================================

app.post("/api/generate-post", async (req, res) => {
  try {
    const { userId, workspaceId, prompt, platforms } = req.body;

    if (!workspaceId && !userId) {
      return res.status(400).json({ error: "workspaceId or userId is required" });
    }

    let brandProfile = null;
    if (workspaceId) {
      const result = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .single();
      brandProfile = result.data;
    } else if (userId) {
      const result = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      brandProfile = result.data;
    }

    let systemPrompt = "You are a social media content expert. Generate engaging social media posts.";
    let userPrompt = prompt || "Generate an engaging social media post";

    if (brandProfile) {
      systemPrompt += `\n\nBrand Context:`;
      if (brandProfile.brand_name) systemPrompt += `\n- Brand: ${brandProfile.brand_name}`;
      if (brandProfile.brand_description) systemPrompt += `\n- About: ${brandProfile.brand_description}`;
      if (brandProfile.tone_of_voice) systemPrompt += `\n- Tone: ${brandProfile.tone_of_voice}`;
      if (brandProfile.target_audience) systemPrompt += `\n- Audience: ${brandProfile.target_audience}`;
    }

    if (platforms && platforms.length > 0) {
      systemPrompt += `\n\nOptimize for these platforms: ${platforms.join(', ')}`;
    }

    systemPrompt += `\n\nGenerate 3 short variations. Separate each with "---" on a new line. Be concise. Include hashtags.`;

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
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    const generatedText = openaiResponse.data.choices[0].message.content;
    let variations = generatedText.split(/\n---\n|\n\n---\n\n/).map(v => v.trim()).filter(v => v.length > 0);

    res.json({
      success: true,
      variations: variations.length > 1 ? variations : [generatedText],
      brandProfileUsed: !!brandProfile
    });
  } catch (error) {
    console.error("Error generating post:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to generate post" });
  }
});

// ============================================================
// TEAM MANAGEMENT ENDPOINTS
// ============================================================

app.post("/api/send-team-invite", async (req, res) => {
  try {
    const { email, role, userId } = req.body;

    if (!email || !role || !userId) {
      return res.status(400).json({ error: "Email, role, and userId are required" });
    }

    const validRoles = ['admin', 'editor', 'view_only'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('owner_id', userId)
      .eq('email', email.toLowerCase())
      .single();

    if (existingMember) {
      return res.status(400).json({ error: 'This user is already a team member' });
    }

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
      return res.status(500).json({ error: 'Failed to create invitation' });
    }

    // Send email if Resend is configured
    if (resend) {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const inviterName = userData?.user?.email || 'A team member';
      const appUrl = process.env.APP_URL || 'https://woozysocial.com';
      const inviteLink = `${appUrl}/accept-invite?token=${invitation.invite_token}`;

      try {
        await resend.emails.send({
          from: 'Social Media Team <hello@woozysocial.com>',
          to: [email],
          subject: `${inviterName} invited you to join their team`,
          html: `<p>You've been invited to join a team. <a href="${inviteLink}">Click here to accept</a></p>`
        });
      } catch (emailError) {
        console.error('Email error:', emailError);
      }
    }

    res.json({ success: true, invitation });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to send invitation" });
  }
});

app.get("/api/team/validate-invite", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const { data: invitation, error } = await supabase
      .from('team_invitations')
      .select('id, email, role, status, invited_at, expires_at, owner_id')
      .eq('invite_token', token)
      .single();

    if (error || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    res.json({ data: invitation });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: "Failed to validate invitation" });
  }
});

app.post("/api/team/accept-invite", async (req, res) => {
  try {
    const { token, userId } = req.body;

    if (!token || !userId) {
      return res.status(400).json({ error: "Token and userId are required" });
    }

    const { data: invitation, error: fetchError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (fetchError || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: `This invitation has already been ${invitation.status}` });
    }

    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    if (now > expiresAt) {
      await supabase.from('team_invitations').update({ status: 'expired' }).eq('id', invitation.id);
      return res.status(400).json({ error: 'This invitation has expired' });
    }

    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const userEmail = userData?.user?.email?.toLowerCase();

    if (!userEmail || userEmail !== invitation.email.toLowerCase()) {
      return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    }

    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        owner_id: invitation.owner_id,
        member_id: userId,
        role: invitation.role,
        joined_at: new Date().toISOString()
      });

    if (memberError) {
      return res.status(500).json({ error: 'Failed to add you to the team' });
    }

    await supabase.from('team_invitations').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', invitation.id);

    res.json({ message: 'Successfully joined the team!', role: invitation.role });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: "Failed to accept invitation" });
  }
});

app.get("/api/team/members", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const { data: members, error } = await supabase
      .from('team_members')
      .select('id, owner_id, member_id, role, created_at, joined_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch team members' });
    }

    const memberIds = (members || []).map((m) => m.member_id);
    let profilesById = {};

    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, email, full_name')
        .in('id', memberIds);

      profilesById = (profiles || []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});
    }

    const enrichedMembers = (members || []).map((m) => ({
      ...m,
      profile: profilesById[m.member_id] || null,
    }));

    res.json({ data: enrichedMembers });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

app.get("/api/team/pending-invites", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const { data: invites, error } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('owner_id', userId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch pending invites' });
    }

    res.json({ data: invites || [] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch pending invites' });
  }
});

app.post("/api/team/cancel-invite", async (req, res) => {
  try {
    const { inviteId, userId } = req.body;

    if (!inviteId || !userId) {
      return res.status(400).json({ error: "inviteId and userId are required" });
    }

    const { data: invite, error } = await supabase
      .from('team_invitations')
      .select('id, owner_id, status')
      .eq('id', inviteId)
      .single();

    if (error || !invite) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invite.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invitations can be cancelled' });
    }

    await supabase.from('team_invitations').update({ status: 'cancelled' }).eq('id', inviteId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to cancel invitation' });
  }
});

app.post("/api/team/remove-member", async (req, res) => {
  try {
    const { memberId, userId } = req.body;

    if (!memberId || !userId) {
      return res.status(400).json({ error: "memberId and userId are required" });
    }

    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, owner_id, member_id')
      .eq('id', memberId)
      .single();

    if (error || !member) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    if (member.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the team owner can remove members' });
    }

    if (member.member_id === userId) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    await supabase.from('team_members').delete().eq('id', memberId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

app.post("/api/team/update-role", async (req, res) => {
  try {
    const { memberId, newRole, userId } = req.body;

    if (!memberId || !newRole || !userId) {
      return res.status(400).json({ error: "memberId, newRole, and userId are required" });
    }

    const validRoles = ['admin', 'editor', 'view_only'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, owner_id')
      .eq('id', memberId)
      .single();

    if (error || !member) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    if (member.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the team owner can change roles' });
    }

    await supabase.from('team_members').update({ role: newRole }).eq('id', memberId);

    res.json({ success: true, newRole });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ============================================================
// HASHTAG GENERATION
// ============================================================

app.post("/api/hashtag/generate", async (req, res) => {
  try {
    const { text, numHashtags } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a social media hashtag expert. Return ONLY hashtags, one per line.' },
          { role: 'user', content: `Generate ${numHashtags || 5} relevant hashtags for: ${text}` }
        ],
        temperature: 0.7,
        max_tokens: 100
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    const hashtagText = openaiResponse.data.choices[0].message.content;
    const hashtags = hashtagText.split('\n').map(t => t.trim()).filter(t => t.startsWith('#')).slice(0, numHashtags || 5);

    res.json({ success: true, hashtags });
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to generate hashtags" });
  }
});

// Export for Vercel
export default app;
