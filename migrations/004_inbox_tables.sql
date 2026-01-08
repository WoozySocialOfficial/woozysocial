-- Social Inbox Tables Migration
-- Supports Direct Messages from Facebook, Instagram, Twitter/X

-- ============================================
-- INBOX CONVERSATIONS TABLE
-- Caches conversation metadata for fast loading
-- ============================================
CREATE TABLE IF NOT EXISTS inbox_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'twitter')),
  ayrshare_conversation_id TEXT NOT NULL,
  correspondent_id TEXT,
  correspondent_name TEXT,
  correspondent_username TEXT,
  correspondent_avatar TEXT,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_sender TEXT, -- 'user' or 'correspondent'
  unread_count INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  can_reply BOOLEAN DEFAULT true, -- False if Instagram 7-day window expired
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, platform, ayrshare_conversation_id)
);

-- ============================================
-- INBOX MESSAGES TABLE
-- Caches individual messages for offline viewing
-- ============================================
CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  ayrshare_message_id TEXT,
  platform_message_id TEXT,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'correspondent')),
  sender_name TEXT,
  message_text TEXT,
  media_urls JSONB DEFAULT '[]',
  media_type TEXT, -- 'image', 'video', 'audio', etc.
  sent_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INBOX READ STATUS TABLE
-- Tracks per-user read status (for teams)
-- ============================================
CREATE TABLE IF NOT EXISTS inbox_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_message_id UUID REFERENCES inbox_messages(id),
  UNIQUE(user_id, conversation_id)
);

-- ============================================
-- INBOX WEBHOOK EVENTS TABLE
-- Logs incoming webhook events for debugging
-- ============================================
CREATE TABLE IF NOT EXISTS inbox_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'message_received', 'message_read', 'reaction', etc.
  platform TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_workspace ON inbox_conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_platform ON inbox_conversations(platform);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_updated ON inbox_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_unread ON inbox_conversations(workspace_id, unread_count) WHERE unread_count > 0;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_conversation ON inbox_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_sent ON inbox_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_ayrshare_id ON inbox_messages(ayrshare_message_id);

CREATE INDEX IF NOT EXISTS idx_inbox_read_status_user ON inbox_read_status(user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_read_status_conversation ON inbox_read_status(conversation_id);

CREATE INDEX IF NOT EXISTS idx_inbox_webhook_unprocessed ON inbox_webhook_events(processed, created_at) WHERE processed = false;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE inbox_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_read_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_webhook_events ENABLE ROW LEVEL SECURITY;

-- Conversations: Workspace members can view their workspace's conversations
CREATE POLICY inbox_conversations_workspace_access ON inbox_conversations
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Messages: Users can view messages in conversations they have access to
CREATE POLICY inbox_messages_access ON inbox_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT ic.id FROM inbox_conversations ic
      JOIN workspace_members wm ON ic.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Read status: Users can only manage their own read status
CREATE POLICY inbox_read_status_own ON inbox_read_status
  FOR ALL USING (user_id = auth.uid());

-- Webhook events: Workspace members can view their workspace's events
CREATE POLICY inbox_webhook_events_access ON inbox_webhook_events
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update conversation when new message arrives
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inbox_conversations
  SET
    last_message_text = NEW.message_text,
    last_message_at = NEW.sent_at,
    last_message_sender = NEW.sender_type,
    unread_count = CASE
      WHEN NEW.sender_type = 'correspondent' THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update conversation on new message
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON inbox_messages;
CREATE TRIGGER trigger_update_conversation_on_message
  AFTER INSERT ON inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- Function to mark conversation as read
CREATE OR REPLACE FUNCTION mark_conversation_read(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS void AS $$
BEGIN
  -- Update or insert read status
  INSERT INTO inbox_read_status (user_id, conversation_id, last_read_at)
  VALUES (p_user_id, p_conversation_id, NOW())
  ON CONFLICT (user_id, conversation_id)
  DO UPDATE SET last_read_at = NOW();

  -- Reset unread count on conversation
  UPDATE inbox_conversations
  SET unread_count = 0, updated_at = NOW()
  WHERE id = p_conversation_id;
END;
$$ LANGUAGE plpgsql;
