# Social Inbox & Analytics Setup Guide

## Step 1: Run Database Migration

Go to Supabase SQL Editor and run:

```sql
-- Add analytics columns to posts table
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS analytics JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS analytics_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_analytics_updated ON posts(analytics_updated_at);

COMMENT ON COLUMN posts.analytics IS 'Analytics data from Ayrshare (likes, comments, shares, impressions, etc.)';
COMMENT ON COLUMN posts.analytics_updated_at IS 'Timestamp when analytics were last updated from Ayrshare';
```

## Step 2: Configure Webhook in Ayrshare

1. Go to https://app.ayrshare.com
2. Click **Settings** → **Webhooks**
3. Add a new webhook with:
   - **URL**: `https://woozysocial.com/api/webhooks/ayrshare`
   - **Events**: Select ALL (especially Comments, Messages, Analytics)
4. Click **Save**

## Step 3: Test the Webhook

### Test Comments:
1. Go to one of your social media posts (Instagram, Twitter, etc.)
2. Comment on it from a different account
3. Wait 30 seconds
4. Check WoozySocial **Engagement** page - comment should appear

### Test Messages:
1. Send a DM to your connected social account
2. Wait 30 seconds
3. Check WoozySocial **Social Inbox** - message should appear

### Test Analytics:
1. Go to **Schedule** page in WoozySocial
2. Click on a post that has been live for a while
3. Analytics should show (likes, comments, shares, views)

## Troubleshooting

### Webhook not receiving events:

Check webhook logs in Ayrshare dashboard:
- Go to Settings → Webhooks
- Click on your webhook
- Check "Recent Deliveries" tab
- Look for HTTP 200 responses (success)

### Still no data in WoozySocial:

Check the `inbox_webhook_events` table in Supabase:
```sql
SELECT * FROM inbox_webhook_events ORDER BY created_at DESC LIMIT 10;
```

If you see events with `processed: false`, there's an error processing them. Check the payload column to see what Ayrshare is sending.

### Analytics not showing:

The analytics are populated by:
1. Webhooks from Ayrshare (automatic)
2. Manual fetch when you view a post (coming next)

If a post shows "⚠️ Post not found", it means the `ayr_post_id` doesn't match or analytics haven't been fetched yet.

## What Gets Tracked

- **Comments**: All comments on your social posts across platforms
- **Messages/DMs**: Direct messages from Instagram, Twitter, etc.
- **Analytics**: Likes, comments, shares, impressions, reach, clicks
- **Engagement**: Total engagement metrics per post

All data is stored in WoozySocial database and synced in real-time via webhooks.
