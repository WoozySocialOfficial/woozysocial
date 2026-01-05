# Checking Team Invitations Issue

## Problem
The pending invitations section is not showing invites that were sent.

## Possible Causes

### 1. Table Doesn't Exist
The `team_invitations` table might not have been created in Supabase yet.

### 2. RLS Policies Blocking Access
Row Level Security might be preventing the frontend from reading the data.

### 3. Data Not Being Saved
The invite might not have been saved to the database at all.

---

## Step-by-Step Fix

### Step 1: Check if Table Exists

1. Go to **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project: `adyeceovkhnacaxkymih`
3. Go to **Table Editor** in the left sidebar
4. Look for `team_invitations` table

**If table exists**: ✅ Go to Step 2
**If table doesn't exist**: ❌ Go to Step 1b

---

### Step 1b: Create the Table

1. In Supabase, go to **SQL Editor**
2. Click **New Query**
3. Copy the contents of `create-team-invitations-table.sql`
4. Paste and click **Run**
5. You should see "Success" message

---

### Step 2: Check if Data Exists

Run this query in **SQL Editor**:

```sql
SELECT * FROM team_invitations
WHERE status = 'pending'
ORDER BY invited_at DESC;
```

**If you see rows**: ✅ Data exists - Go to Step 3
**If no rows**: ❌ Go to Step 2b

---

### Step 2b: Check Backend Logs

1. Check your backend terminal (where server.js is running)
2. Look for messages when you sent the invite:
   - ✅ "Invitation created successfully: [UUID]"
   - ❌ "Error creating invitation:" (means table doesn't exist or RLS blocked it)

---

### Step 3: Check RLS Policies

In **SQL Editor**, run:

```sql
SELECT * FROM pg_policies
WHERE tablename = 'team_invitations';
```

**Expected policies:**
- `Users can view their own sent invitations`
- `Users can view invitations sent to them`
- `Users can insert their own invitations`
- `Users can update their own invitations`

**If missing**: Run the SQL from `create-team-invitations-table.sql`

---

### Step 4: Test in Browser Console

1. Open your app: http://localhost:5173
2. Open browser DevTools (F12)
3. Go to **Console** tab
4. Look for errors when the Team page loads:
   - ✅ "Fetching pending invites..."
   - ❌ "Error fetching pending invites: [error]"

---

### Step 5: Manual Test Query

In **SQL Editor**, test if you can read as your user:

```sql
-- First, get your user ID
SELECT id, email FROM auth.users
WHERE email = 'your-email@example.com';

-- Then check invitations for that user
SELECT * FROM team_invitations
WHERE owner_id = 'YOUR-USER-ID-FROM-ABOVE';
```

---

## Quick Fix Commands

### Option A: Via SQL Editor (Recommended)

1. Go to Supabase SQL Editor
2. Run the entire `create-team-invitations-table.sql` file
3. Refresh your app
4. Send a new test invite
5. Check if it appears in Pending Invitations

### Option B: Check Data Manually

```sql
-- See all invitations in the database
SELECT
  id,
  email,
  role,
  status,
  invited_at,
  expires_at
FROM team_invitations
ORDER BY invited_at DESC;
```

---

## Expected Behavior After Fix

1. ✅ Send an invite from Team page
2. ✅ Backend logs: "Invitation created successfully"
3. ✅ Email received by invitee
4. ✅ Invite appears in "Pending Invitations" section immediately
5. ✅ Shows email, role, dates
6. ✅ Resend and Cancel buttons work

---

## Common Issues

### Issue: "relation 'team_invitations' does not exist"
**Fix**: Run `create-team-invitations-table.sql` in SQL Editor

### Issue: "new row violates row-level security policy"
**Fix**: RLS policies are too strict - run the policy creation part of the SQL

### Issue: Data exists but not showing in UI
**Fix**: Check browser console for errors, might be RLS blocking SELECT

### Issue: Nothing in database at all
**Fix**: Backend isn't saving - check server logs for errors

---

## Verification Checklist

After running the SQL file, verify:

- [ ] Table `team_invitations` exists in Table Editor
- [ ] Table has columns: id, owner_id, email, role, status, invite_token, invited_at, expires_at
- [ ] RLS is enabled on the table
- [ ] 4 policies exist for the table
- [ ] Can send an invite and see "success" in backend logs
- [ ] Email is received
- [ ] Invite appears in Pending Invitations section
- [ ] Can click Resend and Cancel buttons

---

## Next Steps

Once the table is created and data is showing:

1. Test sending an invite
2. Verify it appears in Pending Invitations
3. Test Resend button
4. Test Cancel button
5. Proceed to **Phase 5: Accept Invite Flow**
