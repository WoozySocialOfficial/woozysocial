const axios = require("axios");
const {
  setCors,
  getSupabase,
  ErrorCodes,
  sendSuccess,
  sendError,
  logError,
  isValidUUID,
  applyRateLimit,
  isServiceConfigured
} = require("./_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  // Rate limiting: 20 generations per minute per user
  const rateLimited = applyRateLimit(req, res, 'generate-post', { maxRequests: 20, windowMs: 60000 });
  if (rateLimited) return;

  // Check if OpenAI is configured
  if (!isServiceConfigured('openai')) {
    return sendError(res, "AI generation service is not configured", ErrorCodes.CONFIG_ERROR);
  }

  try {
    const { userId, workspaceId, prompt, platforms } = req.body;

    if (!workspaceId && !userId) {
      return sendError(res, "workspaceId or userId is required", ErrorCodes.VALIDATION_ERROR);
    }

    if (workspaceId && !isValidUUID(workspaceId)) {
      return sendError(res, "Invalid workspaceId format", ErrorCodes.VALIDATION_ERROR);
    }

    if (userId && !isValidUUID(userId)) {
      return sendError(res, "Invalid userId format", ErrorCodes.VALIDATION_ERROR);
    }

    // Validate prompt length
    if (prompt && prompt.length > 1000) {
      return sendError(res, "Prompt exceeds maximum length of 1000 characters", ErrorCodes.VALIDATION_ERROR);
    }

    const supabase = getSupabase();
    let brandProfile = null;

    if (supabase) {
      if (workspaceId) {
        const { data, error } = await supabase
          .from('brand_profiles')
          .select('*')
          .eq('workspace_id', workspaceId)
          .single();

        if (error && error.code !== 'PGRST116') {
          logError('generate-post.getBrandProfile', error, { workspaceId });
        }
        brandProfile = data;
      } else if (userId) {
        const { data, error } = await supabase
          .from('brand_profiles')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          logError('generate-post.getBrandProfile', error, { userId });
        }
        brandProfile = data;
      }
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

    let openaiResponse;
    try {
      openaiResponse = await axios.post(
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
          },
          timeout: 30000
        }
      );
    } catch (axiosError) {
      logError('generate-post.openai', axiosError);
      return sendError(
        res,
        "Failed to generate post content",
        ErrorCodes.EXTERNAL_API_ERROR,
        axiosError.response?.data
      );
    }

    const generatedText = openaiResponse.data.choices[0].message.content;
    let variations = generatedText.split(/\n---\n|\n\n---\n\n/).map(v => v.trim()).filter(v => v.length > 0);

    return sendSuccess(res, {
      variations: variations.length > 1 ? variations : [generatedText],
      brandProfileUsed: !!brandProfile
    });

  } catch (error) {
    logError('generate-post.handler', error);
    return sendError(res, "Failed to generate post", ErrorCodes.INTERNAL_ERROR);
  }
};
