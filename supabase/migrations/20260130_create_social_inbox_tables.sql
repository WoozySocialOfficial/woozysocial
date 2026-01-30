-- Create tables for Social Inbox and Engagement features

-- Table for storing ENGAGEMENT comments from social media followers
-- (NOT the same as post_comments which is for internal team collaboration)
CREATE TABLE IF NOT EXISTS social_engagement_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- facebook, instagram, tiktok, etc.
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

-- Table for storing DM conversations
CREATE TABLE IF NOT EXISTS inbox_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL, -- Conversation ID from platform
  platform TEXT NOT NULL, -- instagram, twitter, facebook, etc.
  participant_username TEXT,
  participant_profile_url TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_inbox_conversations_workspace ON inbox_conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_last_message ON inbox_conversations(last_message_at DESC);

-- Table for storing individual DM messages
CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL, -- Message ID from platform
  platform TEXT NOT NULL,
  message_text TEXT,
  sender_username TEXT,
  recipient_username TEXT,
  is_from_user BOOLEAN DEFAULT false, -- true if sent by us, false if received
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_conversation ON inbox_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_created_at ON inbox_messages(created_at DESC);

-- Table for logging webhook events (for debugging)
CREATE TABLE IF NOT EXISTS inbox_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- comment, message, analytics, etc.
  platform TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON inbox_webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON inbox_webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON inbox_webhook_events(event_type);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE social_engagement_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_webhook_events ENABLE ROW LEVEL SECURITY;

-- Policy for social_engagement_comments: Users can see engagement comments for posts in their workspace
CREATE POLICY social_engagement_comments_select_policy ON social_engagement_comments
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Policy for inbox_conversations: Users can see conversations in their workspace
CREATE POLICY inbox_conversations_select_policy ON inbox_conversations
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Policy for inbox_messages: Users can see messages from conversations they have access to
CREATE POLICY inbox_messages_select_policy ON inbox_messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM inbox_conversations
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- Policy for inbox_webhook_events: Only service role can access (for debugging)
-- No user-facing RLS policy - service role only

-- Comments
COMMENT ON TABLE social_engagement_comments IS 'Engagement comments from social media followers on published posts (not team collaboration comments)';
COMMENT ON TABLE inbox_conversations IS 'DM conversations from social media platforms';
COMMENT ON TABLE inbox_messages IS 'Individual messages within conversations';
COMMENT ON TABLE inbox_webhook_events IS 'Log of all webhook events received from Ayrshare';
