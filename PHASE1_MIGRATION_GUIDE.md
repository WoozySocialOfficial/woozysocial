# Phase 1: Database Schema Migration Guide

## Overview
This guide walks you through adding subscription tracking columns to your `user_profiles` table in Supabase.

---

## What This Migration Does

### Adds 4 New Columns:

1. **`subscription_status`** (TEXT, default: 'inactive')
   - Tracks whether user has an active subscription
   - Values: `inactive`, `active`, `cancelled`, `past_due`

2. **`subscription_tier`** (TEXT, nullable)
   - Stores the subscription plan level
   - Values: `starter`, `pro`, `enterprise`, `legacy`

3. **`profile_created_at`** (TIMESTAMPTZ, nullable)
   - Records when the Ayrshare profile was created
   - Used for analytics and billing

4. **`is_whitelisted`** (BOOLEAN, default: false)
   - Allows test accounts to bypass payment during development
   - Set to `true` for your development email addresses

### Grandfathers Existing Users:

- Any user with an existing `ayr_profile_key` will be marked as:
  - `subscription_status = 'active'`
  - `subscription_tier = 'legacy'`
  - `profile_created_at = created_at`
- This ensures existing users continue working without disruption

---

## Step-by-Step Instructions

### 1. Open Supabase SQL Editor

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project: **Ayrshare Social API Demo**
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**

### 2. Copy and Paste the Migration

Open the migration file:
```
migrations/add-subscription-fields.sql
```

Copy the **entire contents** (excluding the rollback section at the bottom) and paste into the Supabase SQL Editor.

### 3. Review Before Running

**IMPORTANT:** Before clicking "Run", review:
- ✅ You're in the correct project
- ✅ You're on the correct database (production vs development)
- ✅ You understand this will modify the `user_profiles` table

### 4. Run the Migration

Click the **"Run"** button (or press `Cmd+Enter` / `Ctrl+Enter`)

### 5. Verify Success

After running, you should see:

**Output 1: Column Verification**
```
column_name          | data_type            | column_default | is_nullable
---------------------|----------------------|----------------|------------
subscription_status  | text                 | 'inactive'     | YES
subscription_tier    | text                 | NULL           | YES
profile_created_at   | timestamp with...    | NULL           | YES
is_whitelisted       | boolean              | false          | YES
```

**Output 2: User Count by Status**
```
subscription_status | subscription_tier | user_count
--------------------|-------------------|------------
active              | legacy            | 2
inactive            | NULL              | 0
```

**Output 3: User List**
Shows all users with their subscription status and profile key status.

---

## What Happens Next

After this migration:

✅ **Existing users continue working** - Marked as 'active' with 'legacy' tier
✅ **New signups are 'inactive'** - No Ayrshare profile until they pay/whitelist
✅ **Database ready for subscription system** - All tracking columns in place

---

## Common Issues & Solutions

### Issue: "Column already exists"
**Solution:** The migration uses `IF NOT EXISTS`, so it's safe to re-run. If you see this, the columns are already added.

### Issue: "No users updated to 'active'"
**Cause:** No existing users have `ayr_profile_key`
**Solution:** This is fine if you're starting fresh. Existing users will be grandfathered in automatically.

### Issue: "Permission denied"
**Cause:** You need admin/owner access to alter tables
**Solution:**
1. Verify you're logged into the correct Supabase account
2. Check you have owner/admin permissions on the project
3. Contact project owner if needed

---

## Rollback Instructions

**Only use if something goes wrong and you need to undo the migration.**

1. Go to Supabase SQL Editor
2. Copy the **ROLLBACK section** from the migration file (lines at the bottom)
3. Uncomment it (remove the `/*` and `*/`)
4. Run it

This will remove all 4 columns from `user_profiles`.

**WARNING:** After rollback, you'll need to:
- Remove subscription checks from your code
- Revert to auto-creating profiles at signup

---

## Testing the Migration

After running the migration, test in your app:

### Test 1: Check Existing User Profile
```sql
SELECT
  email,
  subscription_status,
  subscription_tier,
  ayr_profile_key,
  profile_created_at
FROM user_profiles
WHERE email = 'your-email@example.com';
```

**Expected:**
- `subscription_status = 'active'`
- `subscription_tier = 'legacy'`
- `ayr_profile_key` is NOT NULL
- `profile_created_at` matches `created_at`

### Test 2: Create a New Test User
1. Sign up with a new email in your app
2. Check the database:
```sql
SELECT
  email,
  subscription_status,
  subscription_tier,
  ayr_profile_key,
  is_whitelisted
FROM user_profiles
WHERE email = 'new-test@example.com';
```

**Expected:**
- `subscription_status = 'inactive'`
- `subscription_tier = NULL`
- `ayr_profile_key = NULL` (since we haven't implemented profile blocking yet)
- `is_whitelisted = false`

---

## Next Steps

After successfully running this migration:

1. ✅ Mark Phase 1 as complete
2. Move to **Phase 2: Environment Configuration**
   - Add whitelist emails to `.env`
   - Set up testing mode flags

---

## Questions or Issues?

If you encounter any problems:

1. **Check the Supabase logs** (Logs tab in dashboard)
2. **Take a screenshot** of any error messages
3. **Don't panic** - The rollback script can undo everything

---

## Migration Checklist

Before marking Phase 1 complete, verify:

- [ ] Migration ran without errors
- [ ] Column verification query shows all 4 columns
- [ ] Existing users have `subscription_status = 'active'`
- [ ] New columns have correct default values
- [ ] You can query user profiles successfully
- [ ] Documented any issues encountered

**Status:** Ready to run!
