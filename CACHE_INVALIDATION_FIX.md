# Automatic Cache Invalidation - Production Fix

## Problem
Production dashboard showed 0 posts while localhost showed 31 posts. The root cause was **stale KV cache** that wasn't being invalidated when new posts were created.

### Why it happened:
- **Localhost**: No KV cache → always fetches fresh data from Ayrshare
- **Production**: KV cache with 120-second TTL → serves stale data
- **No automatic invalidation**: Creating new posts didn't clear the cache

## Solution Implemented

### ✅ Automatic Cache Invalidation

Added cache invalidation that triggers automatically when posts are created, updated, or approved.

### Files Modified:

#### 1. `api/_utils.js` - Cache Invalidation Helpers
Added two new helper functions:
- `invalidatePostHistoryCache(profileKey)` - Invalidates cache for a specific Ayrshare profile
- `invalidateWorkspaceCache(workspaceId)` - Invalidates cache for a workspace (convenience wrapper)

#### 2. `api/post.js` - Post Creation
Added cache invalidation after:
- Post created and pending approval
- Post updated and pending approval
- Scheduled post created
- Scheduled post updated
- Immediate post published

#### 3. `api/post/approve.js` - Post Approvals
Added cache invalidation after:
- Post approved
- Post rejected
- Changes requested

#### 4. `api/scheduler.js` - Scheduled Posts
Added cache invalidation after:
- Scheduled post is published by the cron job

## How It Works

```javascript
// When a post is created/updated/approved:
await invalidateWorkspaceCache(workspaceId);
// ↓
// Gets the workspace's ayr_profile_key from database
// ↓
// Deletes KV cache key: `ayrshare:history:${profileKey}`
// ↓
// Next API call fetches fresh data from Ayrshare
```

## Deployment Steps

### 1. Clear Current Stale Cache (One-Time)
Before deploying, clear the current stale cache in Vercel:
1. Go to Vercel Dashboard → Your Project → Storage → KV
2. Delete all keys matching: `ayrshare:history:*`
3. OR wait 2 minutes for cache to expire naturally

### 2. Deploy to Production
```bash
# Commit the changes
git add .
git commit -m "Add automatic cache invalidation for post history"

# Push to production
git push origin master
```

Vercel will automatically deploy the changes.

### 3. Verify the Fix
1. Navigate to production dashboard
2. Create a new post
3. Refresh the dashboard
4. The analytics should update immediately (no 2-minute wait)

## Benefits

### ✅ Scalable
- No manual cache clearing needed
- Works automatically for all workspaces
- Handles thousands of users

### ✅ Performance
- Still benefits from caching (reduces API calls to Ayrshare)
- Cache is only cleared when data actually changes
- Fresh data without sacrificing speed

### ✅ Reliable
- Cache stays in sync with actual post data
- No stale data issues
- Consistent experience across all environments

## Cache Behavior

### Before Fix:
- Post created → Cache NOT invalidated
- User sees old data for 2 minutes (until TTL expires)
- Multiple users could see different data

### After Fix:
- Post created → Cache IMMEDIATELY invalidated
- Next request fetches fresh data
- All users see consistent, up-to-date data

## Monitoring

You can verify cache invalidation is working by checking Vercel logs:
```
[Cache] Invalidated post history cache for profile: 5A9AB0CB...
```

## Future Improvements

Consider implementing:
1. **Cache warming**: Pre-populate cache after invalidation
2. **Selective invalidation**: Only invalidate specific parts of cached data
3. **Cache tags**: Use tags for more granular invalidation
4. **Real-time updates**: WebSocket notifications for instant UI updates

## Testing

To test locally (KV won't be available, but code won't break):
1. Create a new post
2. Check console logs for cache invalidation attempts
3. Verify no errors are thrown

Production testing:
1. Create a test post
2. Immediately check dashboard
3. Verify the new post appears without delay
