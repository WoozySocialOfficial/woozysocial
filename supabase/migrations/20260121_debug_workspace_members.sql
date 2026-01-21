-- =====================================================
-- Debug Workspace Members Access
-- =====================================================
-- This helps diagnose the "Not a workspace member" issue
-- =====================================================

-- 1. Check if there are any workspace_members at all
SELECT
  'Total workspace_members count:' as info,
  COUNT(*) as count
FROM public.workspace_members;

-- 2. Check workspace_members structure
SELECT
  'Workspace Members Table Structure:' as info,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workspace_members'
ORDER BY ordinal_position;

-- 3. List all workspace members with their details
SELECT
  'All Workspace Members:' as info,
  wm.id,
  wm.workspace_id,
  wm.user_id,
  wm.role,
  wm.can_manage_team,
  wm.can_approve_posts,
  up.email,
  up.full_name,
  w.name as workspace_name
FROM public.workspace_members wm
LEFT JOIN public.user_profiles up ON up.id = wm.user_id
LEFT JOIN public.workspaces w ON w.id = wm.workspace_id
ORDER BY wm.created_at DESC;

-- 4. Check RLS policies on workspace_members
SELECT
  'RLS Policies on workspace_members:' as info,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'workspace_members';

-- 5. Check if RLS is enabled on workspace_members
SELECT
  'RLS Status:' as info,
  tablename,
  CASE
    WHEN relrowsecurity THEN 'ENABLED'
    ELSE 'DISABLED'
  END as rls_status
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND pg_class.relname = 'workspace_members';

-- 6. Test workspace membership query (replace with actual IDs)
-- This simulates what the API does
DO $$
DECLARE
  test_user_id uuid;
  test_workspace_id uuid;
  member_count integer;
BEGIN
  -- Get any user and workspace from the database for testing
  SELECT user_id, workspace_id
  INTO test_user_id, test_workspace_id
  FROM public.workspace_members
  LIMIT 1;

  IF test_user_id IS NOT NULL THEN
    -- Simulate the API query
    SELECT COUNT(*) INTO member_count
    FROM public.workspace_members
    WHERE user_id = test_user_id
      AND workspace_id = test_workspace_id;

    RAISE NOTICE 'Test Query Results:';
    RAISE NOTICE '  User ID: %', test_user_id;
    RAISE NOTICE '  Workspace ID: %', test_workspace_id;
    RAISE NOTICE '  Found % member(s)', member_count;
  ELSE
    RAISE NOTICE 'No workspace members found in database';
  END IF;
END $$;

-- =====================================================
-- Diagnostic Queries Complete
-- =====================================================
-- Run these queries in Supabase SQL Editor to see:
-- 1. Total workspace_members count
-- 2. Table structure
-- 3. All members with details
-- 4. RLS policies
-- 5. RLS status
-- 6. Test query simulation
-- =====================================================
