-- =====================================================
-- Notifications System
-- =====================================================
-- This migration creates/updates the notifications table and supporting functions
-- for the in-app notification system with optional email delivery
-- =====================================================

-- 1. Check if table exists and add missing columns
DO $$
BEGIN
  -- Create table if it doesn't exist
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    CREATE TABLE public.notifications (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      workspace_id uuid NULL,
      post_id uuid NULL,
      type text NOT NULL,
      title text NOT NULL,
      message text NOT NULL,
      read boolean DEFAULT false,
      created_at timestamp with time zone DEFAULT now(),
      read_at timestamp with time zone NULL,
      action_url text NULL,
      metadata jsonb NULL,
      CONSTRAINT notifications_pkey PRIMARY KEY (id),
      CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES auth.users (id) ON DELETE CASCADE,
      CONSTRAINT notifications_workspace_id_fkey FOREIGN KEY (workspace_id)
        REFERENCES workspaces (id) ON DELETE CASCADE,
      CONSTRAINT notifications_post_id_fkey FOREIGN KEY (post_id)
        REFERENCES posts (id) ON DELETE SET NULL
    );
  ELSE
    -- Table exists, add missing columns if needed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'notifications'
                   AND column_name = 'read_at') THEN
      ALTER TABLE public.notifications ADD COLUMN read_at timestamp with time zone NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'notifications'
                   AND column_name = 'action_url') THEN
      ALTER TABLE public.notifications ADD COLUMN action_url text NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'notifications'
                   AND column_name = 'metadata') THEN
      ALTER TABLE public.notifications ADD COLUMN metadata jsonb NULL;
    END IF;
  END IF;

  -- Drop old constraint if exists and recreate with new types
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_type_check') THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  END IF;

  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'approval_request',
    'approval_approved',
    'approval_rejected',
    'post_published',
    'post_failed',
    'team_invite',
    'team_member_joined',
    'team_member_left',
    'workspace_created',
    'weekly_summary',
    'comment_mention',
    'post_comment'
  ));
END $$;

COMMENT ON TABLE public.notifications IS 'In-app notifications for users';
COMMENT ON COLUMN public.notifications.user_id IS 'User who receives the notification';
COMMENT ON COLUMN public.notifications.workspace_id IS 'Associated workspace (optional)';
COMMENT ON COLUMN public.notifications.post_id IS 'Associated post (optional)';
COMMENT ON COLUMN public.notifications.type IS 'Notification type for categorization and filtering';
COMMENT ON COLUMN public.notifications.title IS 'Notification title/heading';
COMMENT ON COLUMN public.notifications.message IS 'Notification message/body';
COMMENT ON COLUMN public.notifications.read IS 'Whether user has read this notification';
COMMENT ON COLUMN public.notifications.read_at IS 'When notification was marked as read';
COMMENT ON COLUMN public.notifications.action_url IS 'URL to navigate to when notification is clicked';
COMMENT ON COLUMN public.notifications.metadata IS 'Additional data (JSON)';

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications USING btree (user_id);

CREATE INDEX IF NOT EXISTS notifications_workspace_id_idx
  ON public.notifications USING btree (workspace_id);

CREATE INDEX IF NOT EXISTS notifications_read_idx
  ON public.notifications USING btree (user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_type_idx
  ON public.notifications USING btree (type);

-- 3. Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Create function to get unread notification count
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER
  INTO unread_count
  FROM notifications
  WHERE user_id = p_user_id AND read = false;

  RETURN COALESCE(unread_count, 0);
END;
$$;

COMMENT ON FUNCTION public.get_unread_notification_count IS 'Get count of unread notifications for a user';

-- 6. Create function to mark all notifications as read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE notifications
  SET read = true, read_at = now()
  WHERE user_id = p_user_id AND read = false;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION public.mark_all_notifications_read IS 'Mark all unread notifications as read for a user';

-- =====================================================
-- Migration Complete
-- =====================================================
-- Summary:
-- ✅ Created notifications table with all required columns
-- ✅ Created indexes for performance (user_id, workspace_id, read status, created_at, type)
-- ✅ Enabled Row Level Security
-- ✅ Created RLS policies (users can only see/update their own notifications)
-- ✅ Created helper function to get unread count
-- ✅ Created helper function to mark all as read
-- =====================================================
