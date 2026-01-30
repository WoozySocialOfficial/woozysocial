-- Create table for Social Engagement Comments
-- This is SEPARATE from post_comments (which is for internal team collaboration)
-- This table stores comments from social media followers

CREATE TABLE IF NOT EXISTS social_engagement_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- facebook, instagram, tiktok, twitter, etc.
  external_id TEXT NOT NULL, -- Comment ID from the platform
  comment_text TEXT NOT NULL,
  author_username TEXT,
  author_profile_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, platform) -- Prevent duplicate comments
);

CREATE INDEX IF NOT EXISTS idx_social_engagement_comments_post_id ON social_engagement_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_engagement_comments_workspace_id ON social_engagement_comments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_social_engagement_comments_created_at ON social_engagement_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_engagement_comments_platform ON social_engagement_comments(platform);

-- Enable RLS
ALTER TABLE social_engagement_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see engagement comments for posts in their workspace
CREATE POLICY social_engagement_comments_select_policy ON social_engagement_comments
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Table comment
COMMENT ON TABLE social_engagement_comments IS 'Engagement comments from social media followers on published posts (not team collaboration comments)';
COMMENT ON COLUMN social_engagement_comments.external_id IS 'Comment ID from the social platform';
COMMENT ON COLUMN social_engagement_comments.comment_text IS 'The actual comment text from the follower';
