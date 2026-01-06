-- =============================================
-- SUBSCRIPTION FIELDS MIGRATION
-- Adds subscription tracking to user_profiles table
-- Run this in Supabase SQL Editor
-- =============================================

-- STEP 1: Add subscription columns to user_profiles
-- =============================================

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS subscription_tier TEXT;

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS profile_created_at TIMESTAMPTZ;

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS is_whitelisted BOOLEAN DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN user_profiles.subscription_status IS 'Subscription status: inactive, active, cancelled, or past_due';
COMMENT ON COLUMN user_profiles.subscription_tier IS 'Subscription tier: starter, pro, enterprise, or legacy';
COMMENT ON COLUMN user_profiles.profile_created_at IS 'Timestamp when Ayrshare profile was created';
COMMENT ON COLUMN user_profiles.is_whitelisted IS 'True if user is whitelisted for testing (bypasses payment requirement)';

-- =============================================
-- STEP 2: Update existing users with profile keys
-- Mark them as active to grandfather them in
-- =============================================

UPDATE user_profiles
SET
  subscription_status = 'active',
  subscription_tier = 'legacy',
  profile_created_at = created_at
WHERE ayr_profile_key IS NOT NULL
  AND subscription_status = 'inactive';

-- =============================================
-- STEP 3: Verify the changes
-- =============================================

-- Check the new columns exist
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
  AND column_name IN ('subscription_status', 'subscription_tier', 'profile_created_at', 'is_whitelisted')
ORDER BY ordinal_position;

-- Check how many users have active subscriptions
SELECT
  subscription_status,
  subscription_tier,
  COUNT(*) as user_count
FROM user_profiles
GROUP BY subscription_status, subscription_tier
ORDER BY subscription_status, subscription_tier;

-- List all users with their subscription status
SELECT
  id,
  email,
  subscription_status,
  subscription_tier,
  is_whitelisted,
  CASE
    WHEN ayr_profile_key IS NOT NULL THEN 'Has Profile Key'
    ELSE 'No Profile Key'
  END as profile_key_status,
  profile_created_at,
  created_at
FROM user_profiles
ORDER BY created_at DESC;

-- =============================================
-- ROLLBACK (if needed)
-- Run this ONLY if you need to undo the changes
-- =============================================

/*
-- Remove the columns
ALTER TABLE user_profiles DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS subscription_tier;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS profile_created_at;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS is_whitelisted;
*/
