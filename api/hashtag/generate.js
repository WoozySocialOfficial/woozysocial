const axios = require("axios");
const {
  setCors,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  applyRateLimit,
  isServiceConfigured
} = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  // Rate limiting: 30 hashtag generations per minute
  const rateLimited = applyRateLimit(req, res, 'hashtag-generate', { maxRequests: 30, windowMs: 60000 });
  if (rateLimited) return;

  // Check if OpenAI is configured
  if (!isServiceConfigured('openai')) {
    return sendError(res, "AI generation service is not configured", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { text, numHashtags } = req.body;

    if (!text) {
      return sendError(res, "Text is required", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate text length
    if (text.length > 2000) {
      return sendError(res, "Text exceeds maximum length of 2000 characters", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate numHashtags
    const hashtagCount = Math.min(Math.max(parseInt(numHashtags) || 5, 1), 30);

    let openaiResponse;
    try {
      openaiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a social media hashtag expert. Return ONLY hashtags, one per line.' },
            { role: 'user', content: `Generate ${hashtagCount} relevant hashtags for: ${text}` }
          ],
          temperature: 0.7,
          max_tokens: 100
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          timeout: 30000
        }
      );
    } catch (axiosError) {
      logError('hashtag.generate.openai', axiosError);
      return sendError(
        res,
        "Failed to generate hashtags",
        ErrorCodes.EXTERNAL_API_ERROR,
        axiosError.response?.data
      );
    }

    const hashtagText = openaiResponse.data.choices[0].message.content;
    const hashtags = hashtagText
      .split('\n')
      .map(t => t.trim())
      .filter(t => t.startsWith('#'))
      .slice(0, hashtagCount);

    return sendSuccess(res, { hashtags });

  } catch (error) {
    logError('hashtag.generate.handler', error);
    return sendError(res, "Failed to generate hashtags", ErrorCodes.INTERNAL_ERROR);
  }
};
