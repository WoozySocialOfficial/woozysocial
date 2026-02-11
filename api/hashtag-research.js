const axios = require("axios");
const {
  setCors,
  sendSuccess,
  sendError,
  ErrorCodes,
} = require("./_utils");

/**
 * Hashtag Research API - AI-powered hashtag suggestions
 * POST /api/hashtag-research
 * Body: { topic, platform, count }
 */
module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  try {
    const { topic, platform, count = 5 } = req.body;

    if (!topic || topic.trim().length === 0) {
      return sendError(res, "Topic is required", ErrorCodes.VALIDATION_ERROR);
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      // Return curated fallback hashtags
      return sendSuccess(res, {
        hashtags: getFallbackHashtags(topic, platform, count),
        source: "curated"
      });
    }

    // Use OpenAI to generate relevant hashtags
    const hashtags = await generateHashtagsWithAI(topic, platform, count, openaiKey);

    return sendSuccess(res, {
      hashtags,
      source: "ai_generated",
      topic,
      platform
    });

  } catch (error) {
    console.error("Hashtag Research API error:", error);
    return sendError(res, "Failed to generate hashtags", ErrorCodes.INTERNAL_ERROR);
  }
};

/**
 * Generate hashtags using OpenAI
 */
async function generateHashtagsWithAI(topic, platform, count, apiKey) {
  const platformContext = platform ? getPlatformContext(platform) : "";

  const systemPrompt = `You are a social media expert who specializes in hashtag strategy. Generate highly relevant, trending hashtags that will maximize reach and engagement.

${platformContext}

Rules:
1. Return ONLY hashtags, no explanations
2. Include a mix of:
   - Popular/trending hashtags (high reach)
   - Niche-specific hashtags (targeted audience)
   - Branded/unique hashtags (differentiators)
3. Order by relevance (most relevant first)
4. No spaces in hashtags
5. All lowercase
6. Each hashtag on its own line
7. Include the # symbol`;

  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate ${count} hashtags for: "${topic}"` }
    ],
    temperature: 0.7,
    max_tokens: 500
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  });

  const content = response.data.choices[0]?.message?.content || '';

  // Parse hashtags from response
  const hashtags = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('#'))
    .map(tag => ({
      tag: tag.replace('#', ''),
      display: tag,
      category: categorizeHashtag(tag)
    }))
    .slice(0, count);

  return hashtags;
}

/**
 * Get platform-specific context for hashtag generation
 */
function getPlatformContext(platform) {
  const contexts = {
    instagram: `Platform: Instagram
- 10-15 hashtags recommended
- Mix of popular (1M+ posts) and niche (10K-100K posts)
- Include location hashtags if relevant
- Use hashtags that match content type (photo, reel, story)`,

    twitter: `Platform: Twitter/X
- 1-2 hashtags MAX for best engagement
- Focus on trending topics
- Use hashtags that are currently active
- Short, memorable hashtags work best`,

    linkedin: `Platform: LinkedIn
- 3-5 hashtags recommended
- Professional, industry-specific hashtags
- Avoid casual or entertainment hashtags
- Focus on thought leadership topics`,

    tiktok: `Platform: TikTok
- 3-5 hashtags recommended
- Include trending challenge hashtags
- Use #fyp #foryou #foryoupage sparingly
- Niche-specific hashtags perform better`,

    facebook: `Platform: Facebook
- 1-3 hashtags maximum
- Hashtags are less important on Facebook
- Focus on branded hashtags
- Community and group-specific hashtags`,

    pinterest: `Platform: Pinterest
- 2-5 hashtags in description
- Keyword-focused, SEO-friendly
- Seasonal and event hashtags
- Niche-specific for better discovery`
  };

  return contexts[platform.toLowerCase()] || "";
}

/**
 * Categorize hashtag by type
 */
function categorizeHashtag(tag) {
  const tagLower = tag.toLowerCase();

  // Popular/trending indicators
  const popularPatterns = ['viral', 'trending', 'fyp', 'foryou', 'explore'];
  if (popularPatterns.some(p => tagLower.includes(p))) {
    return 'trending';
  }

  // Niche indicators (typically longer or very specific)
  if (tag.length > 15) {
    return 'niche';
  }

  // Industry indicators
  const industryPatterns = ['marketing', 'business', 'tech', 'startup', 'entrepreneur', 'finance'];
  if (industryPatterns.some(p => tagLower.includes(p))) {
    return 'industry';
  }

  return 'general';
}

/**
 * Fallback hashtags when AI is not available
 */
function getFallbackHashtags(topic, platform, count) {
  const topicWords = topic.toLowerCase().split(/\s+/);
  const baseHashtags = [];

  // Create hashtags from topic words
  topicWords.forEach(word => {
    if (word.length > 2) {
      baseHashtags.push({
        tag: word,
        display: `#${word}`,
        category: 'topic'
      });
    }
  });

  // Combined topic hashtag
  const combined = topicWords.join('');
  if (combined.length <= 20) {
    baseHashtags.push({
      tag: combined,
      display: `#${combined}`,
      category: 'topic'
    });
  }

  // Platform-specific popular hashtags
  const platformHashtags = {
    instagram: ['instagood', 'photooftheday', 'instadaily', 'content', 'viral'],
    twitter: ['trending', 'viral', 'mustread', 'news'],
    linkedin: ['leadership', 'business', 'innovation', 'growth', 'success'],
    tiktok: ['fyp', 'viral', 'trending', 'foryou'],
    facebook: ['community', 'follow', 'share'],
    pinterest: ['inspiration', 'ideas', 'diy', 'aesthetic']
  };

  const platformTags = platformHashtags[platform?.toLowerCase()] || ['content', 'trending', 'viral'];
  platformTags.forEach(tag => {
    baseHashtags.push({
      tag,
      display: `#${tag}`,
      category: 'popular'
    });
  });

  // General engagement hashtags
  const engagementTags = ['explore', 'discover', 'follow', 'like', 'share'];
  engagementTags.forEach(tag => {
    baseHashtags.push({
      tag,
      display: `#${tag}`,
      category: 'engagement'
    });
  });

  return baseHashtags.slice(0, count);
}
