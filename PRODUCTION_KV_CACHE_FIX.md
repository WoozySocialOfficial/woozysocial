# Production Dashboard Analytics Fix - KV Cache Issue

## Root Cause
The production API uses Vercel KV to cache Ayrshare history responses for 2 minutes. If the cache was populated with empty data (e.g., during an API error or before posts existed), it continues serving that stale empty data until the cache expires or is manually cleared.

Localhost doesn't have KV, so it always fetches fresh data directly from Ayrshare.

## Solution Options

### Option 1: Wait for Cache to Expire (Easiest)
- The cache TTL is 120 seconds (2 minutes)
- Simply wait 2-3 minutes and refresh your dashboard
- The cache will expire and fetch fresh data

### Option 2: Clear Vercel KV Cache (Recommended)
1. Go to your Vercel dashboard
2. Navigate to your project → Storage → KV
3. Find and delete keys matching pattern: `ayrshare:history:*`
4. Specifically delete: `ayrshare:history:5A9AB0CB-FF9B47A1-85A76948-CD839A0E` (Gucci workspace)

### Option 3: Disable KV Caching Temporarily
Modify [api/post-history.js](../api/post-history.js) to skip cache:

```javascript
// Comment out the cache retrieval
// if (kv) {
//   try {
//     const cached = await kv.get(cacheKey);
//     if (cached) {
//       ayrshareHistory = cached;
//     }
//   } catch (cacheErr) {
//     // Cache miss or error, continue to fetch
//   }
// }
```

Then redeploy.

### Option 4: Add Cache Bypass Parameter (Long-term Fix)
Add a query parameter to force fresh data:

```javascript
const { userId, workspaceId, bypassCache } = req.query;

// Skip cache if bypassCache=true
if (kv && !bypassCache) {
  try {
    const cached = await kv.get(cacheKey);
    if (cached) {
      ayrshareHistory = cached;
    }
  } catch (cacheErr) {
    // Cache miss or error, continue to fetch
  }
}
```

Then call: `/api/post-history?workspaceId=xxx&bypassCache=true`

## Verification
After applying the fix:
1. Open production site and navigate to dashboard
2. Open DevTools → Network tab
3. Refresh the page
4. Check `/api/post-history` response - should now show your 31 posts
5. Verify the dashboard displays the correct analytics

## Prevention
Consider implementing:
1. Shorter cache TTL for development/testing environments
2. Cache invalidation on new post creation
3. Health check endpoint to validate cache consistency
