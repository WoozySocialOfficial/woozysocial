/**
 * API Utility Functions
 * Provides safe wrappers for fetch operations with proper error handling
 */

/**
 * Safely parse JSON from a response, handling non-JSON responses gracefully
 * @param {Response} response - Fetch response object
 * @returns {Promise<{data: any, error: string|null}>}
 */
export const safeJsonParse = async (response) => {
  try {
    const text = await response.text();

    // Try to parse as JSON
    try {
      const data = JSON.parse(text);
      return { data, error: null };
    } catch {
      // Not valid JSON - might be HTML error page or plain text
      if (!response.ok) {
        return {
          data: null,
          error: `Server error (${response.status}): ${text.substring(0, 200)}`
        };
      }
      return { data: text, error: null };
    }
  } catch (err) {
    return { data: null, error: err.message };
  }
};

/**
 * Safe fetch wrapper that handles common error cases
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<{data: any, error: string|null, status: number}>}
 */
export const safeFetch = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    const { data, error: parseError } = await safeJsonParse(response);

    if (!response.ok) {
      const errorMessage = data?.error || data?.message || parseError || `Request failed with status ${response.status}`;
      return { data: null, error: errorMessage, status: response.status };
    }

    if (parseError) {
      return { data: null, error: parseError, status: response.status };
    }

    return { data, error: null, status: response.status };
  } catch (err) {
    // Network error or other fetch failure
    return {
      data: null,
      error: err.message || 'Network error',
      status: 0
    };
  }
};

/**
 * Extract response data handling both old and new API formats
 * Old format: { success: true, posts: [...] }
 * New format: { success: true, data: { posts: [...] } }
 * @param {object} response - API response object
 * @returns {object} - Normalized response data
 */
export const normalizeApiResponse = (response) => {
  if (!response) return {};
  return response.data || response;
};
