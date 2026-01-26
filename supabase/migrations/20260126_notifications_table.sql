-- =====================================================
-- Notifications System Enhancement
-- =====================================================
-- This migration adds action_url column to existing notifications table
-- The table already exists with notification_preferences for user settings
-- =====================================================

-- 1. Add action_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                 AND table_name = 'notifications'
                 AND column_name = 'action_url') THEN
    ALTER TABLE public.notifications ADD COLUMN action_url text NULL;
    COMMENT ON COLUMN public.notifications.action_url IS 'URL to navigate to when notification is clicked';
  END IF;
END $$;

-- 2. Create helper function to get unread notification count
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
-- ✅ Added action_url column to existing notifications table
-- ✅ Created helper function to get unread count
-- ✅ Created helper function to mark all as read
--
-- Note: This migration works with the existing notifications table
-- and notification_preferences table. No changes to table structure,
-- indexes, or RLS policies - those already exist.
-- =====================================================
