# Team Member Testing Guide

## Goal
Verify that team members inherit the owner's Ayrshare profile key and can post using the owner's connected social accounts.

---

## Prerequisites

1. **Owner Account:** Whitelisted email with active profile
   - Email: `magebazappleid@gmail.com` (in TEST_ACCOUNT_EMAILS)
   - Has Ayrshare profile key
   - Has connected social accounts

2. **Member Account:** Any email (can be whitelisted or not)
   - Email: `teammember@example.com`
   - Does NOT need own profile key
   - Should inherit owner's profile

---

## Test Steps

### Step 1: Set Up Owner Account

1. **Sign in as owner:**
   ```
   Email: magebazappleid@gmail.com
   Password: [your password]
   ```

2. **Verify owner has profile:**
   - Go to Settings → Check that social accounts are connected
   - Or use browser console:
   ```javascript
   // In browser DevTools Console
   fetch('http://localhost:3001/api/user-accounts?userId=YOUR_USER_ID')
     .then(r => r.json())
     .then(console.log)
   ```

3. **Note the owner's workspace ID:**
   - Open React DevTools → Components tab
   - Find `WorkspaceProvider`
   - Copy `activeWorkspace.id` (you'll need this)

---

### Step 2: Invite Team Member

1. **Navigate to Team page:**
   - Click "Team" in sidebar
   - Or go to `http://localhost:5173/team`

2. **Send invitation:**
   - Click "Invite Team Member" or similar button
   - Enter email: `teammember@example.com`
   - Select role: "Member" (or any non-owner role)
   - Click "Send Invite"

3. **Get invitation link:**
   - Check the response/console for invitation link
   - Or check the `workspace_invitations` table in Supabase
   - Format: `http://localhost:5173/accept-invite?token=...`

---

### Step 3: Accept Invitation as Member

1. **Sign up as team member:**
   ```
   Email: teammember@example.com
   Password: [create password]
   ```

2. **Accept the invitation:**
   - Use the invitation link from Step 2
   - Click "Accept Invitation"
   - Should be added to owner's workspace

3. **Verify workspace membership:**
   - Check workspace switcher in sidebar
   - Should show owner's workspace name
   - Your role should be "Member"

---

### Step 4: Test Posting as Team Member

1. **Navigate to Compose page:**
   - Click "Compose" in sidebar
   - Or go to `http://localhost:5173/compose`

2. **Check connected accounts:**
   - Open browser DevTools → Network tab
   - Look for `/api/user-accounts` request
   - Verify it uses `workspaceId` (owner's ID) NOT member's `userId`

3. **Create a test post:**
   - Type some text: "Test post from team member"
   - Select a platform (e.g., Instagram)
   - Click "Post Now"

4. **Verify request uses workspace:**
   - Check Network tab → `/api/post` request
   - Should include `workspaceId: [owner's workspace ID]`
   - Backend should use owner's profile key

5. **Expected Result:**
   - ✅ Post succeeds
   - ✅ Post uses owner's Ayrshare profile
   - ✅ Post appears in owner's post history

---

### Step 5: Verify Backend Logic

1. **Check server logs:**
   ```
   [DIAGNOSTIC] /api/user-accounts called with workspaceId: [owner-workspace-id]
   Using workspace profile key for workspace: [owner-workspace-id]
   ```

2. **Check database:**
   ```sql
   -- Member should NOT have their own profile key
   SELECT id, email, ayr_profile_key, subscription_status
   FROM user_profiles
   WHERE email = 'teammember@example.com';
   -- ayr_profile_key should be NULL

   -- But member is in workspace
   SELECT user_id, workspace_id, role
   FROM workspace_members
   WHERE user_id = [member-user-id];
   -- Should show owner's workspace_id
   ```

---

## Expected Behavior

### ✅ Correct Behavior:

1. **Member Account:**
   - `ayr_profile_key` = NULL (no own profile)
   - `subscription_status` = 'inactive'
   - Can still post to social media

2. **Workspace Inheritance:**
   - Frontend sends `workspaceId` with requests
   - Backend calls `getWorkspaceProfileKey(workspaceId)`
   - Returns owner's profile key
   - Posts use owner's connected accounts

3. **API Requests:**
   ```javascript
   // Compose page sends:
   {
     workspaceId: "owner-workspace-id-123",
     userId: "member-user-id-456",  // Only for tracking who created post
     text: "Test post",
     networks: {...}
   }
   ```

4. **Backend Processing:**
   ```javascript
   // server.js /api/post endpoint
   if (workspaceId) {
     const workspaceProfileKey = await getWorkspaceProfileKey(workspaceId);
     // Uses owner's key for Ayrshare API call
   }
   ```

---

## Troubleshooting

### Problem: Member gets "Subscription required" error

**Possible Causes:**
- `workspaceId` not being sent in request
- `getWorkspaceProfileKey()` returning null
- Workspace doesn't have profile key

**Debug Steps:**
1. Check browser Network tab → verify `workspaceId` in request
2. Check server logs → look for "Using workspace profile key"
3. Query workspace: `SELECT ayr_profile_key FROM workspaces WHERE id = 'workspace-id'`

---

### Problem: Member posts with own profile instead of owner's

**Possible Causes:**
- Frontend sending `userId` instead of `workspaceId`
- Backend checking `userId` before `workspaceId`

**Fix:**
- Verify `ComposeContent.jsx` sends `workspaceId: activeWorkspace.id`
- Verify `server.js` prioritizes `workspaceId` over `userId`

---

### Problem: Member can't see owner's connected accounts

**Possible Causes:**
- `/api/user-accounts` not using `workspaceId`
- Member not in workspace

**Debug:**
```javascript
// In browser console as member
fetch('http://localhost:3001/api/user-accounts?workspaceId=OWNER_WORKSPACE_ID')
  .then(r => r.json())
  .then(console.log)
```

---

## Success Criteria

- [ ] Team member can be invited
- [ ] Team member can accept invitation
- [ ] Team member joins owner's workspace
- [ ] Team member sees owner's workspace in switcher
- [ ] Team member can navigate to Compose page
- [ ] Team member sees owner's connected social accounts
- [ ] Team member can create posts
- [ ] Posts use owner's Ayrshare profile key
- [ ] Posts appear in owner's post history
- [ ] Member does NOT need own subscription

---

## Quick Test Script

If you want to test programmatically:

```javascript
// 1. Sign in as owner, get workspace ID
const ownerWorkspaceId = "copy-from-devtools";

// 2. Sign in as member, test posting
const formData = new FormData();
formData.append("text", "Test from member");
formData.append("workspaceId", ownerWorkspaceId);
formData.append("networks", JSON.stringify({ instagram: true }));

fetch("http://localhost:3001/api/post", {
  method: "POST",
  body: formData
}).then(r => r.json()).then(console.log);

// Expected: Success with post ID
// Backend should use owner's profile key
```

---

## Notes

- Team members inherit workspace context automatically via `WorkspaceContext`
- The `activeWorkspace` from `useWorkspace()` provides the owner's workspace ID
- Backend middleware `requireActiveProfile` checks workspace owner's subscription
- This allows team collaboration without each member needing a subscription
