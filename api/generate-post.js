const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fetch and extract text content from a URL
async function fetchWebsiteContent(url) {
  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WoozySocial/1.0; +https://woozysocial.com)'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = await response.text();

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

// Get brand profile for the workspace
async function getBrandProfile(workspaceId) {
  try {
    const { data, error } = await supabase
      .from('brand_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching brand profile:', error);
    return null;
  }
}

// Generate post using OpenAI
async function generateWithOpenAI(prompt, websiteData, brandProfile, platforms) {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  // Build context from website data
  let websiteContext = '';
  if (websiteData) {
    websiteContext = `
WEBSITE INFORMATION:
URL: ${websiteData.url}
Title: ${websiteData.title || 'N/A'}
Description: ${websiteData.description || 'N/A'}
Content Summary: ${websiteData.content}
`;
  }

  // Build context from brand profile
  let brandContext = '';
  if (brandProfile) {
    brandContext = `
BRAND PROFILE:
Business Name: ${brandProfile.business_name || 'N/A'}
Industry: ${brandProfile.industry || 'N/A'}
Target Audience: ${brandProfile.target_audience || 'N/A'}
Brand Voice: ${brandProfile.brand_voice || 'N/A'}
Key Messages: ${brandProfile.key_messages || 'N/A'}
Hashtags to Use: ${brandProfile.hashtags || 'N/A'}
Topics to Avoid: ${brandProfile.topics_to_avoid || 'N/A'}
`;
  }

  // Platform-specific guidelines
  const platformGuidelines = {
    twitter: 'Twitter/X: Max 280 characters, use hashtags sparingly (1-2), be concise and punchy',
    instagram: 'Instagram: Can be longer, use emojis, include 5-10 relevant hashtags at the end',
    facebook: 'Facebook: Conversational tone, can be longer, encourage engagement with questions',
    linkedin: 'LinkedIn: Professional tone, industry insights, thought leadership, 1-3 hashtags',
    threads: 'Threads: Casual, conversational, similar to Twitter but can be slightly longer',
    tiktok: 'TikTok: Fun, trendy, use popular hashtags, hook in first line',
    pinterest: 'Pinterest: Descriptive, keyword-rich, include a call to action'
  };

  const selectedPlatformGuidelines = platforms
    .map(p => platformGuidelines[p.toLowerCase()])
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `You are a social media content expert. Generate engaging social media posts based on the provided information.

${brandContext}

${websiteContext}

PLATFORM GUIDELINES:
${selectedPlatformGuidelines || 'Create versatile content suitable for multiple platforms'}

INSTRUCTIONS:
1. Generate 3 unique variations of a social media post
2. Each variation should have a different angle or style
3. Match the brand voice if provided
4. Incorporate key information from the website if provided
5. Optimize for the selected platforms
6. Include relevant hashtags where appropriate
7. Keep posts engaging and shareable

Format your response as exactly 3 variations, numbered 1-3, with each on its own line.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Create social media posts about: ${prompt}` }
      ],
      temperature: 0.8,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('OpenAI API error:', error);
    throw new Error(error.error?.message || 'Failed to generate content');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '';

  // Parse variations from response
  const variations = content
    .split(/\n(?=\d+\.)/)
    .map(v => v.trim())
    .filter(v => v.length > 0);

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
    const { workspaceId, prompt, platforms = [], websiteUrl } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID is required" });
    }

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Get brand profile first (we might need its website URL)
    const brandProfile = await getBrandProfile(workspaceId);

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

    // Generate content with OpenAI
    const variations = await generateWithOpenAI(
      prompt,
      websiteData,
      brandProfile,
      platforms
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
