-- =====================================================
-- Sync plan_type with subscription_tier
-- =====================================================
-- The webhook updates subscription_tier but not plan_type,
-- causing them to get out of sync. This migration:
-- 1. Updates the plan_type constraint to match subscription_tier values
-- 2. Syncs existing records
-- =====================================================

-- First, drop the old constraint
ALTER TABLE public.workspaces
DROP CONSTRAINT IF EXISTS workspaces_plan_type_check;

-- Update existing plan_type values to match subscription_tier
UPDATE public.workspaces
SET plan_type = subscription_tier
WHERE subscription_tier IS NOT NULL
  AND subscription_tier != plan_type;

-- For any remaining NULL subscription_tier, set it to plan_type
UPDATE public.workspaces
SET subscription_tier = plan_type
WHERE subscription_tier IS NULL
  AND plan_type IS NOT NULL;

-- Set plan_type = subscription_tier for consistency
UPDATE public.workspaces
SET plan_type = COALESCE(subscription_tier, 'free');

-- Add new constraint that allows all tier values
-- (or just remove constraint to allow any value)
ALTER TABLE public.workspaces
ADD CONSTRAINT workspaces_plan_type_check
CHECK (plan_type IN ('free', 'solo', 'pro', 'pro_plus', 'agency', 'brand_bolt', 'enterprise'));

-- Add a trigger to keep plan_type in sync with subscription_tier
CREATE OR REPLACE FUNCTION sync_workspace_plan_type()
RETURNS TRIGGER AS $$
BEGIN
  -- When subscription_tier changes, update plan_type to match
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    NEW.plan_type := COALESCE(NEW.subscription_tier, NEW.plan_type, 'free');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_plan_type_trigger ON public.workspaces;
CREATE TRIGGER sync_plan_type_trigger
BEFORE UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION sync_workspace_plan_type();

-- Verify the sync
SELECT
  'Sync verification' as info,
  COUNT(*) as total_workspaces,
  SUM(CASE WHEN plan_type = subscription_tier THEN 1 ELSE 0 END) as synced,
  SUM(CASE WHEN plan_type != subscription_tier THEN 1 ELSE 0 END) as mismatched
FROM public.workspaces;
