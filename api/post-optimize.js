const axios = require("axios");
const {
  setCors,
  sendSuccess,
  sendError,
  ErrorCodes,
} = require("./_utils");

/**
 * Post Optimizer API - AI-powered post improvement suggestions
 * POST /api/post-optimize
 * Body: { text, platforms, hasMedia, mediaType, scoreBreakdown }
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
    const { text, platforms = [], hasMedia = false, mediaType = null, scoreBreakdown = {} } = req.body;

    if (!text || text.trim().length === 0) {
      return sendError(res, "Post text is required", ErrorCodes.VALIDATION_ERROR);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return sendSuccess(res, {
        suggestions: getFallbackSuggestions(text, platforms, hasMedia, scoreBreakdown),
        source: "rule_based"
      });
    }

    const suggestions = await optimizeWithAI(text, platforms, hasMedia, mediaType, scoreBreakdown, apiKey);

    return sendSuccess(res, {
      suggestions,
      source: "ai_generated"
    });

  } catch (error) {
    console.error("Post Optimize API error:", error);
    return sendError(res, "Failed to optimize post", ErrorCodes.INTERNAL_ERROR);
  }
};

/**
 * Use Claude AI to generate specific post improvements
 */
async function optimizeWithAI(text, platforms, hasMedia, mediaType, scoreBreakdown, apiKey) {
  const platformList = platforms.length > 0 ? platforms.join(", ") : "general social media";

  const weakAreas = [];
  if (scoreBreakdown.hooks?.score < 10) weakAreas.push("engagement hooks (questions, CTAs, urgency)");
  if (scoreBreakdown.firstLine?.score < 8) weakAreas.push("opening hook / first line");
  if (scoreBreakdown.hashtags?.score < 10) weakAreas.push("hashtag strategy");
  if (scoreBreakdown.emoji?.score < 8) weakAreas.push("emoji usage");
  if (scoreBreakdown.length?.score < 12) weakAreas.push("text length optimization");
  if (scoreBreakdown.url?.score === 0) weakAreas.push("call-to-action with link");

  const systemPrompt = `You are a social media copywriting expert. Analyze the user's post and suggest specific improvements to maximize engagement on ${platformList}.

Return EXACTLY a JSON array of suggestion objects. Each suggestion must have:
- "type": one of "rewrite", "add_hook", "add_cta", "add_hashtags", "add_emoji", "shorten", "lengthen"
- "title": short title (3-6 words)
- "description": why this improves engagement (1 sentence)
- "original": the part of the post being improved (empty string if adding new content)
- "improved": the suggested replacement or addition text
- "impact": estimated score boost as a number (1-20)

Rules:
1. Keep the post's original meaning and voice
2. Be specific - provide actual rewritten text, not vague advice
3. Max 4 suggestions, sorted by impact (highest first)
4. For hashtag suggestions, include the actual hashtags
5. For emoji suggestions, place them naturally in the text
6. Match the tone/style of the original post
7. Return ONLY valid JSON array, no markdown, no explanation
${weakAreas.length > 0 ? `\nFocus on these weak areas: ${weakAreas.join(", ")}` : ""}
${!hasMedia ? "\nNote: No media attached. Consider suggesting media-related advice." : ""}`;

  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001',
    system: systemPrompt,
    messages: [
      { role: 'user', content: `Optimize this post:\n\n"${text}"` }
    ],
    temperature: 0.7,
    max_tokens: 600
  }, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  });

  const content = response.data.content?.[0]?.text || '[]';

  try {
    // Strip markdown code fences if present
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return getFallbackSuggestions(text, platforms, hasMedia, scoreBreakdown);

    return parsed
      .filter(s => s.title && s.improved)
      .slice(0, 4)
      .map(s => ({
        type: s.type || 'rewrite',
        title: s.title,
        description: s.description || '',
        original: s.original || '',
        improved: s.improved,
        impact: Math.min(Math.max(Number(s.impact) || 5, 1), 20)
      }));
  } catch {
    return getFallbackSuggestions(text, platforms, hasMedia, scoreBreakdown);
  }
}

/**
 * Rule-based fallback suggestions when AI is unavailable
 */
function getFallbackSuggestions(text, platforms, hasMedia, scoreBreakdown) {
  const suggestions = [];
  const b = scoreBreakdown;

  // First line hook
  if (!b.firstLine || b.firstLine.score < 8) {
    const firstLine = text.split('\n')[0] || text.substring(0, 60);
    const hasQuestion = /\?|!/.test(firstLine);
    if (!hasQuestion && firstLine.length > 10) {
      suggestions.push({
        type: 'add_hook',
        title: 'Stronger opening hook',
        description: 'Posts with strong openers get 3x more engagement.',
        original: firstLine,
        improved: `🔥 ${firstLine}${firstLine.endsWith('?') || firstLine.endsWith('!') ? '' : ' — here\'s why 👇'}`,
        impact: 12
      });
    }
  }

  // Engagement question
  if (!b.hooks || !b.hooks.hasQuestion) {
    suggestions.push({
      type: 'add_cta',
      title: 'Add engagement question',
      description: 'Questions drive 2x more comments.',
      original: '',
      improved: '\n\nWhat do you think? Drop your thoughts below 👇',
      impact: 8
    });
  }

  // CTA
  if (!b.hooks || !b.hooks.hasCTA) {
    suggestions.push({
      type: 'add_cta',
      title: 'Add call-to-action',
      description: 'CTAs increase engagement by up to 285%.',
      original: '',
      improved: '\n\nSave this for later and share with someone who needs it!',
      impact: 7
    });
  }

  // Hashtags
  if (!b.hashtags || b.hashtags.count === 0) {
    const topicWords = text.split(/\s+/).filter(w => w.length > 4).slice(0, 3);
    const tags = topicWords.map(w => `#${w.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    if (tags.length > 0) {
      suggestions.push({
        type: 'add_hashtags',
        title: 'Add relevant hashtags',
        description: 'Hashtags increase discoverability by up to 40%.',
        original: '',
        improved: `\n\n${tags.join(' ')} #socialmedia #content`,
        impact: 10
      });
    }
  }

  // Emoji
  if (!b.emoji || b.emoji.count === 0) {
    suggestions.push({
      type: 'add_emoji',
      title: 'Add emojis for engagement',
      description: 'Posts with emojis get 25% more engagement.',
      original: text.substring(0, 40),
      improved: `✨ ${text.substring(0, 40)}`,
      impact: 6
    });
  }

  return suggestions.sort((a, c) => c.impact - a.impact).slice(0, 4);
}
