-- =============================================
-- ADD SUBSCRIPTION_STATUS TO WORKSPACES TABLE
-- =============================================
-- This column is required by the signup flow to track
-- whether a workspace's subscription is active/inactive
-- =============================================

ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';

COMMENT ON COLUMN workspaces.subscription_status IS 'Subscription status: inactive, active, cancelled, or past_due';

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'workspaces'
  AND column_name = 'subscription_status';
