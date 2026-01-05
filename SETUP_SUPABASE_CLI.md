# Supabase CLI Setup & RLS Fix

Since you reset your PC, you need to re-authenticate with Supabase CLI and then run the SQL to fix RLS policies.

---

## Step 1: Login to Supabase CLI

```powershell
cd social-api-demo
npx supabase login
```

**What happens:**
- A browser window will open
- Login with your Supabase account
- Grant access
- You'll see "Logged in successfully"

---

## Step 2: Link Your Project

```powershell
npx supabase link --project-ref adyeceovkhnacaxkymih
```

**When prompted for the database password:**
- This is your Supabase project database password
- If you don't know it, you can reset it in Supabase Dashboard → Settings → Database → Reset Password

---

## Step 3: Run the RLS Policy Fix via SQL Editor (Easiest Method)

Since the CLI might have issues, the **easiest way** is to use the Supabase Dashboard:

1. **Go to**: https://supabase.com/dashboard/project/adyeceovkhnacaxkymih/editor
2. Click **"SQL Editor"** in the left sidebar
3. Click **"New Query"**
4. **Copy and paste** the SQL below:

```sql
-- Enable RLS if not already enabled
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Users can view their own sent invitations" ON team_invitations;
DROP POLICY IF EXISTS "Users can view invitations sent to them" ON team_invitations;
DROP POLICY IF EXISTS "Users can insert their own invitations" ON team_invitations;
DROP POLICY IF EXISTS "Users can update their own invitations" ON team_invitations;
DROP POLICY IF EXISTS "Service role bypass RLS" ON team_invitations;

-- Policy 1: Allow users to view invitations they sent
CREATE POLICY "Users can view their own sent invitations"
ON team_invitations
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- Policy 2: Allow users to view invitations sent to their email
CREATE POLICY "Users can view invitations sent to them"
ON team_invitations
FOR SELECT
TO authenticated
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Policy 3: Allow authenticated users to insert invitations
CREATE POLICY "Users can insert their own invitations"
ON team_invitations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Policy 4: Allow users to update their own invitations
CREATE POLICY "Users can update their own invitations"
ON team_invitations
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id);

-- Policy 5: Allow service role to bypass RLS (for server.js)
CREATE POLICY "Service role bypass RLS"
ON team_invitations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Verify policies were created
SELECT policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'team_invitations';

-- Check if there's any pending invitation data
SELECT
  id,
  owner_id,
  email,
  role,
  status,
  invited_at
FROM team_invitations
WHERE status = 'pending'
ORDER BY invited_at DESC;
```

5. **Click "RUN"** (play button)

---

## Step 4: Verify It Works

After running the SQL:

1. **Refresh your app**: http://localhost:5173
2. **Go to Team page**
3. **Check the Pending Invitations section**

You should now see any pending invitations!

---

## Alternative: Run SQL via CLI (If CLI is working)

If you successfully logged in and linked the project:

```powershell
cd social-api-demo
npx supabase db execute --file FIX_RLS_POLICIES.sql
```

---

## Troubleshooting

### Issue: "Logged in successfully" but can't link project
**Solution**: Use the SQL Editor method instead (Step 3)

### Issue: Can't find database password
1. Go to: https://supabase.com/dashboard/project/adyeceovkhnacaxkymih/settings/database
2. Click "Reset Database Password"
3. Copy the new password
4. Use it when linking the project

### Issue: SQL runs but still no invitations showing
**Check browser console** (F12) on Team page for errors:
- Look for "Error fetching pending invites"
- The error message will tell us what's wrong

---

## Quick Verification

After running the SQL, you should see in the results:

✅ **5 policies created:**
- Users can view their own sent invitations
- Users can view invitations sent to them
- Users can insert their own invitations
- Users can update their own invitations
- Service role bypass RLS

✅ **Your pending invitation(s)** in the SELECT results

---

## Next Steps After Fix

Once pending invitations are showing:

1. ✅ Test Resend button
2. ✅ Test Cancel button
3. ✅ Send a new test invite
4. 🚀 Move on to **Phase 5: Accept Invite Flow**

---

**Recommended Approach**: Use the **SQL Editor** method (Step 3) - it's the most reliable and doesn't require CLI setup!
