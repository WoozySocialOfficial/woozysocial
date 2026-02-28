/**
 * Translates raw Ayrshare/backend error messages stored in `last_error`
 * into user-friendly messages for the Woozy Social UI.
 *
 * The raw error is kept in the database for debugging;
 * this function only affects what the user sees.
 */

const ERROR_RULES = [
  // Instagram media issues
  {
    test: (msg) => /instagram.*incorrect media/i.test(msg),
    friendly: 'Instagram post failed due to media issues. Only one video is allowed per post, and it must be MP4/MOV format (3s–15min, under 300 MB).',
  },
  {
    test: (msg) => /instagram.*image or video could not be processed/i.test(msg),
    friendly: 'Instagram could not process the attached media. Try resizing or converting the file.',
  },
  {
    test: (msg) => /instagram.*aspect ratio/i.test(msg),
    friendly: 'Instagram requires images between 4:5 and 1.91:1 aspect ratio. Please resize your media.',
  },

  // Twitter / X media issues
  {
    test: (msg) => /twitter.*media/i.test(msg) || /x.*media/i.test(msg),
    friendly: 'X (Twitter) could not process the attached media. Check file size and format.',
  },

  // Facebook media issues
  {
    test: (msg) => /facebook.*media/i.test(msg),
    friendly: 'Facebook could not process the attached media. Try a different file format or size.',
  },

  // Generic media errors
  {
    test: (msg) => /media error/i.test(msg) || /media.*not supported/i.test(msg),
    friendly: 'One or more platforms could not process the attached media. Check the file format and size.',
  },
  {
    test: (msg) => /image base64 size.*exceeds/i.test(msg),
    friendly: 'One or more images are too large. Please resize images to under 5 MB each.',
  },

  // Rate limiting
  {
    test: (msg) => /rate limit/i.test(msg) || /too many requests/i.test(msg),
    friendly: 'Too many requests. Please wait a moment and try again.',
  },

  // Auth / token issues
  {
    test: (msg) => /token.*expired/i.test(msg) || /unauthorized/i.test(msg) || /authentication/i.test(msg) || /needs to be reconnected/i.test(msg),
    friendly: 'Your social account needs to be reconnected. Go to Social Accounts to reconnect.',
  },

  // Duplicate content
  {
    test: (msg) => /duplicate/i.test(msg) || /already posted/i.test(msg),
    friendly: 'This content was already posted. Try changing the text or media.',
  },

  // No accounts connected
  {
    test: (msg) => /no social media accounts connected/i.test(msg) || /no.*profile.*key/i.test(msg),
    friendly: 'No social accounts are connected. Go to Social Accounts to link your profiles.',
  },

  // Timeout / network
  {
    test: (msg) => /timeout/i.test(msg) || /timed out/i.test(msg),
    friendly: 'The request timed out. The post may still go through — check back shortly.',
  },
  {
    test: (msg) => /failed to connect/i.test(msg) || /network/i.test(msg),
    friendly: 'Could not reach the social media service. Please try again.',
  },
];

export function formatPostError(rawError) {
  if (!rawError) return null;

  const msg = typeof rawError === 'string' ? rawError : String(rawError);

  // Handle "platform: error; platform: error" format from scheduler reconciliation
  if (msg.includes(';') && /^\w+:/.test(msg)) {
    const parts = msg.split(';').map((s) => s.trim());
    const translated = parts.map((part) => {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) return translateSingle(part);
      const platform = part.substring(0, colonIdx).trim();
      const error = part.substring(colonIdx + 1).trim();
      const friendly = translateSingle(error);
      return `${capitalize(platform)}: ${friendly}`;
    });
    return translated.join('. ');
  }

  // Handle "Partial: ..." prefix from scheduler
  if (msg.startsWith('Partial:')) {
    const inner = msg.replace(/^Partial:\s*/, '');
    return `Partial delivery — ${formatPostError(inner)}`;
  }

  return translateSingle(msg);
}

function translateSingle(msg) {
  for (const rule of ERROR_RULES) {
    if (rule.test(msg)) return rule.friendly;
  }
  // Fallback: strip Ayrshare URLs and return cleaned message
  return msg.replace(/\s*https?:\/\/www\.ayrshare\.com\S*/gi, '').trim();
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export default formatPostError;
