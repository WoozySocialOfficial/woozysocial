-- Add analytics columns to posts table for storing Ayrshare analytics data

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS analytics JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS analytics_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_analytics_updated ON posts(analytics_updated_at);

COMMENT ON COLUMN posts.analytics IS 'Analytics data from Ayrshare (likes, comments, shares, impressions, etc.)';
COMMENT ON COLUMN posts.analytics_updated_at IS 'Timestamp when analytics were last updated from Ayrshare';
