const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fetch and extract text content from a URL
async function fetchWebsiteContent(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WoozySocial/1.0; +https://woozysocials.com)'
      },
      timeout: 10000
    });

    const html = response.data;

    // Extract text content from HTML
    // Remove scripts, styles, and HTML tags
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Extract meta description and title for better context
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);

    const title = titleMatch ? titleMatch[1].trim() : '';
    const description = descMatch ? descMatch[1].trim() : (ogDescMatch ? ogDescMatch[1].trim() : '');

    // Limit content length for API
    const maxLength = 3000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '...';
    }

    return {
      title,
      description,
      content: text,
      url
    };
  } catch (error) {
    console.error('Error fetching website:', error.message);
    return null;
  }
}

// Get brand profile for the workspace (with user_id fallback)
async function getBrandProfile(workspaceId, userId) {
  try {
    // Try workspace_id first
    if (workspaceId) {
      const { data, error } = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .single();

      if (!error && data) {
        return data;
      }
    }

    // Fallback to user_id for backwards compatibility
    if (userId) {
      const { data, error } = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!error && data) {
        return data;
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching brand profile:', error);
    return null;
  }
}

// Generate post using Claude AI
async function generateWithAI(prompt, websiteData, brandProfile, platforms, useEmojis = true) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('AI API key not configured');
  }

  // Build context from website data
  let websiteContext = '';
  if (websiteData) {
    websiteContext = `
═══ WEBSITE CONTENT TO REFERENCE ═══
URL: ${websiteData.url}
Page Title: ${websiteData.title || 'N/A'}
Meta Description: ${websiteData.description || 'N/A'}
Key Content: ${websiteData.content}
════════════════════════════════════
`;
  }

  // Build context from brand profile
  let brandContext = '';
  if (brandProfile) {
    brandContext = `
═══ BRAND IDENTITY ═══
Brand: ${brandProfile.brand_name || 'N/A'}
About: ${brandProfile.brand_description || 'N/A'}
Target Audience: ${brandProfile.target_audience || 'General audience'}
Voice & Tone: ${brandProfile.tone_of_voice || 'Professional yet approachable'}
Core Topics: ${brandProfile.key_topics || 'N/A'}
Values: ${brandProfile.brand_values || 'N/A'}
Writing Style Examples: ${brandProfile.sample_posts || 'N/A'}
══════════════════════
`;
  }

  // Enhanced platform-specific guidelines with character limits and best practices
  const platformGuidelines = {
    twitter: `Twitter/X:
    - STRICT 280 character limit
    - Hook in first 5 words
    - 1-2 hashtags MAX (at end, not inline)
    - Use line breaks for readability
    - Questions boost replies 100%
    - Threads format: Start with hook, end with CTA`,

    instagram: `Instagram:
    - First line is CRUCIAL (shows in feed)
    - 2,200 char limit but 125-150 optimal
    - Use 1-2 emojis per line
    - 3-5 hashtags at the VERY END (after line breaks)
    - Include clear CTA
    - Use line breaks every 1-2 sentences`,

    facebook: `Facebook:
    - 40-80 characters get 86% more engagement
    - Ask questions to boost comments
    - Conversational, relatable tone
    - 1-2 hashtags maximum
    - Stories/personal angles work best
    - Use emojis sparingly`,

    linkedin: `LinkedIn:
    - Open with a HOOK (controversial take, surprising stat, or question)
    - Use line breaks after every sentence
    - 1,300 chars for full visibility (before "see more")
    - 3-5 hashtags at end
    - Professional but human tone
    - End with question or CTA for engagement
    - Avoid buzzwords, be authentic`,

    threads: `Threads:
    - 500 character limit
    - Casual, conversational tone
    - No hashtags needed (algorithm-based)
    - Hot takes and opinions perform well
    - Reply-style content works
    - Emojis welcome`,

    tiktok: `TikTok Caption:
    - First 3 words must HOOK
    - 150 chars optimal (shows without tapping)
    - 3-5 trending hashtags
    - Include CTA (follow, like, comment)
    - Casual, Gen-Z friendly language
    - Use trending sounds/challenges references`,

    pinterest: `Pinterest:
    - 100-200 characters optimal
    - Keyword-rich for SEO
    - Describe WHAT, WHY, HOW
    - Clear CTA (Click, Save, Shop)
    - No hashtags needed
    - Benefits-focused copy`
  };

  const selectedPlatformGuidelines = platforms
    .map(p => platformGuidelines[p.toLowerCase()])
    .filter(Boolean)
    .join('\n\n');

  // Static prompt (cached by Anthropic — 90% cheaper on repeat calls)
  const staticPrompt = `You write social media posts that sound human, casual, and real. No corporate buzzwords.
Rules: 1-3 sentences per post. Hook first. Max 5 hashtags at end. Use contractions. Be specific.
Never use: "excited to announce", "game-changer", "unlock", "leverage", "journey", "empower", "don't miss out".
Output 3 variations separated by --- on its own line. No bold, no markdown, no labels, no numbering.
Variation 1: Casual/chill. Variation 2: Slightly polished. Variation 3: Bold take or question.`;

  // Dynamic context (changes per request — not cached)
  const dynamicParts = [];
  if (brandContext) dynamicParts.push(brandContext);
  if (websiteContext) dynamicParts.push(websiteContext);
  if (selectedPlatformGuidelines) dynamicParts.push(`Platform rules:\n${selectedPlatformGuidelines}`);
  dynamicParts.push(useEmojis ? 'Use 0-2 emojis if natural.' : 'No emojis.');

  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001',
    system: [
      { type: 'text', text: staticPrompt, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicParts.join('\n') }
    ],
    messages: [
      { role: 'user', content: `Write 3 social media posts about: ${prompt}` }
    ],
    temperature: 0.85,
    max_tokens: 500
  }, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  });

  const content = response.data.content?.[0]?.text || '';

  // Parse variations - handle Claude's formatting (bold numbers, --- separators, etc.)
  let variations;

  // Try splitting by --- separator first (Claude often uses this)
  if (content.includes('---')) {
    variations = content
      .split(/\n---\n|\n-{3,}\n/)
      .map(v => v.trim())
      .filter(v => v.length > 10);
  }

  // If that didn't work well, try splitting by numbered patterns (1. or **1.** or **1**)
  if (!variations || variations.length < 2) {
    variations = content
      .split(/\n(?=\*{0,2}\d+[\.\)]\*{0,2}\s)/)
      .map(v => v.trim())
      .filter(v => v.length > 10);
  }

  // Clean up each variation: remove number prefixes, bold markers, headers
  variations = (variations || [content]).map(v => {
    return v
      .replace(/^#+\s.*\n*/, '')                    // Remove # headers
      .replace(/^\*{1,2}\d+[\.\)]\*{0,2}\s*/, '')  // Remove **1.** or *1.* or 1.
      .replace(/^\d+[\.\)]\s*/, '')                 // Remove plain 1. or 1)
      .replace(/^\*{1,2}Variation\s+\d+:?\*{0,2}\s*/i, '') // Remove **Variation 1:**
      .trim();
  }).filter(v => v.length > 10);

  return variations.length > 0 ? variations : [content];
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { workspaceId, userId, prompt, platforms = [], websiteUrl, useEmojis = true } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID is required" });
    }

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Get brand profile first (we might need its website URL)
    const brandProfile = await getBrandProfile(workspaceId, userId);

    // Fetch website content - use provided URL or fall back to brand profile website
    let websiteData = null;
    const urlToFetch = (websiteUrl && websiteUrl.trim()) || brandProfile?.website_url;

    if (urlToFetch) {
      try {
        // Validate URL
        new URL(urlToFetch);
        websiteData = await fetchWebsiteContent(urlToFetch.trim());
      } catch (urlError) {
        console.error('Invalid URL or fetch error:', urlError.message);
        // Continue without website data
      }
    }

    // Generate content with Claude AI
    const variations = await generateWithAI(
      prompt,
      websiteData,
      brandProfile,
      platforms,
      useEmojis
    );

    return res.status(200).json({
      success: true,
      variations,
      brandProfileUsed: !!brandProfile,
      websiteUsed: !!websiteData,
      websiteTitle: websiteData?.title || null
    });

  } catch (error) {
    console.error("Error generating post:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate post"
    });
  }
};
