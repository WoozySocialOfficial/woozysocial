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

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);

    const title = titleMatch ? titleMatch[1].trim() : '';
    const description = descMatch ? descMatch[1].trim() : (ogDescMatch ? ogDescMatch[1].trim() : '');

    const maxLength = 3000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '...';
    }

    return { title, description, content: text, url };
  } catch (error) {
    console.error('Error fetching website:', error.message);
    return null;
  }
}

// Get brand profile for the workspace
async function getBrandProfile(workspaceId, userId) {
  try {
    if (workspaceId) {
      const { data, error } = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .single();
      if (!error && data) return data;
    }
    if (userId) {
      const { data, error } = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (!error && data) return data;
    }
    return null;
  } catch (error) {
    console.error('Error fetching brand profile:', error);
    return null;
  }
}

// Generate post using OpenAI
async function generateWithAI(prompt, websiteData, brandProfile, platforms, useEmojis = true) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('AI API key not configured');
  }

  // Build context from website data
  let websiteContext = '';
  if (websiteData) {
    websiteContext = `\nWebsite: ${websiteData.url}\nTitle: ${websiteData.title || 'N/A'}\nContent: ${websiteData.content}`;
  }

  // Build context from brand profile
  let brandContext = '';
  if (brandProfile) {
    brandContext = `\nBrand: ${brandProfile.brand_name || 'N/A'}`;
    if (brandProfile.brand_description) brandContext += `\nAbout: ${brandProfile.brand_description}`;
    if (brandProfile.target_audience) brandContext += `\nAudience: ${brandProfile.target_audience}`;
    if (brandProfile.tone_of_voice) brandContext += `\nTone: ${brandProfile.tone_of_voice}`;
    if (brandProfile.key_topics) brandContext += `\nTopics: ${brandProfile.key_topics}`;
  }

  // Platform guidelines
  const platformGuidelines = {
    twitter: 'Twitter/X: 280 char limit, 1-2 hashtags, hook first',
    instagram: 'Instagram: 125-150 chars optimal, 3-5 hashtags at end, CTA',
    facebook: 'Facebook: 40-80 chars best, conversational, 1-2 hashtags',
    linkedin: 'LinkedIn: Hook opener, line breaks, 3-5 hashtags at end, professional',
    threads: 'Threads: 500 char limit, casual, no hashtags needed',
    tiktok: 'TikTok: 150 chars optimal, 3-5 hashtags, casual',
    pinterest: 'Pinterest: 100-200 chars, keyword-rich, CTA'
  };

  const selectedPlatformGuidelines = platforms
    .map(p => platformGuidelines[p.toLowerCase()])
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `You write social media posts that sound human, casual, and real. No corporate buzzwords.
Rules: 1-3 sentences per post. Hook first. Max 5 hashtags at end. Use contractions. Be specific.
Never use: "excited to announce", "game-changer", "unlock", "leverage", "journey", "empower", "don't miss out".
${useEmojis ? 'Use 0-2 emojis if natural.' : 'No emojis.'}
${selectedPlatformGuidelines ? `Platform rules:\n${selectedPlatformGuidelines}` : ''}
${brandContext}${websiteContext}

Output 3 variations separated by --- on its own line. No bold, no markdown, no labels, no numbering.
Variation 1: Casual/chill. Variation 2: Slightly polished. Variation 3: Bold take or question.`;

  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001',
    system: systemPrompt,
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

  // Parse variations
  let variations;

  if (content.includes('---')) {
    variations = content
      .split(/\n---\n|\n-{3,}\n/)
      .map(v => v.trim())
      .filter(v => v.length > 10);
  }

  if (!variations || variations.length < 2) {
    variations = content
      .split(/\n(?=\*{0,2}\d+[\.\)]\*{0,2}\s)/)
      .map(v => v.trim())
      .filter(v => v.length > 10);
  }

  variations = (variations || [content]).map(v => {
    return v
      .replace(/^#+\s.*\n*/, '')
      .replace(/^\*{1,2}\d+[\.\)]\*{0,2}\s*/, '')
      .replace(/^\d+[\.\)]\s*/, '')
      .replace(/^\*{1,2}Variation\s+\d+:?\*{0,2}\s*/i, '')
      .trim();
  }).filter(v => v.length > 10);

  return variations.length > 0 ? variations : [content];
}

module.exports = async (req, res) => {
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

    const brandProfile = await getBrandProfile(workspaceId, userId);

    let websiteData = null;
    const urlToFetch = (websiteUrl && websiteUrl.trim()) || brandProfile?.website_url;

    if (urlToFetch) {
      try {
        new URL(urlToFetch);
        websiteData = await fetchWebsiteContent(urlToFetch.trim());
      } catch (urlError) {
        console.error('Invalid URL or fetch error:', urlError.message);
      }
    }

    const variations = await generateWithAI(prompt, websiteData, brandProfile, platforms, useEmojis);

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
