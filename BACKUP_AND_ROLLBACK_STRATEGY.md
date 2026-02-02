# Backup & Rollback Strategy - Before Critical Fixes

## Current Date: 2026-01-30

**CRITICAL:** Do NOT proceed with fixes until ALL backups are complete.

---

## 1. Database Backup (MOST IMPORTANT)

### Option A: Supabase Dashboard (Recommended - Easy)

1. Go to Supabase Dashboard → https://supabase.com/dashboard
2. Select your project
3. Go to "Database" → "Backups" in left sidebar
4. Click "Create Backup" or "Download Backup"
5. Save file as: `woozysocial_backup_2026-01-30_BEFORE_FIXES.sql`

### Option B: SQL Export via SQL Editor

Run this in Supabase SQL Editor and save output:

```sql
-- Export all table structures and data
-- Copy the output and save to: woozysocial_backup_2026-01-30.sql

-- Posts table
SELECT * FROM posts ORDER BY created_at DESC;

-- Post drafts
SELECT * FROM post_drafts ORDER BY created_at DESC;

-- Workspaces
SELECT * FROM workspaces ORDER BY created_at DESC;

-- Workspace members
SELECT * FROM workspace_members ORDER BY created_at DESC;

-- User profiles
SELECT * FROM user_profiles ORDER BY created_at DESC;

-- Short links
SELECT * FROM short_links ORDER BY created_at DESC;

-- Comments
SELECT * FROM post_comments ORDER BY created_at DESC;
SELECT * FROM comment_replies ORDER BY created_at DESC;
SELECT * FROM comment_drafts ORDER BY created_at DESC;

-- Notifications
SELECT * FROM notifications ORDER BY created_at DESC;

-- Inbox tables (currently empty but backup anyway)
SELECT * FROM inbox_conversations;
SELECT * FROM inbox_messages;
SELECT * FROM inbox_read_status;
SELECT * FROM inbox_webhook_events;
```

### Option C: pg_dump (If you have database credentials)

```bash
pg_dump -h [your-supabase-host] -U postgres -d postgres > backup_2026-01-30.sql
```

**Save backup files to:**
- `c:\Users\mageb\OneDrive\Desktop\woozy(13-01)\BACKUPS\database_2026-01-30.sql`
- Also upload to cloud storage (Google Drive, Dropbox, etc.)

---

## 2. Code Backup (Git)

### Create Backup Branch

```bash
cd woozysocial

# Create backup branch from current state
git checkout -b backup-before-fixes-2026-01-30

# Push to remote
git push -u origin backup-before-fixes-2026-01-30

# Return to main
git checkout main

# Tag current commit
git tag -a v1.0-before-fixes -m "Stable state before critical fixes on 2026-01-30"
git push origin v1.0-before-fixes
```

### Create ZIP Backup

```bash
# Create full codebase backup
cd c:\Users\mageb\OneDrive\Desktop
tar -czf woozysocial-backup-2026-01-30.tar.gz woozy(13-01)\woozysocial
```

Or manually:
1. Copy entire `woozysocial` folder
2. Rename to `woozysocial-backup-2026-01-30`
3. Compress to ZIP
4. Save to external drive or cloud

---

## 3. Document Current Working State

### Working Features (As of 2026-01-30)

✅ **WORKING:**
- Login/Signup (JWT tokens, email verification)
- Workspace creation and management
- Team member invitations (view-only, editor roles)
- Drafts (create, edit, load from drafts)
- Immediate posting (single media, multiple images)
- Scheduling posts
- Approval workflow (pending → approved → posted)
- Post deletion from WoozySocial (database only)
- Brand profiles
- Comments and replies
- Notifications (in-app, email)
- Link shortener (WoozySocial branded)
- Phase 4: Post Settings (Thread, Story, Auto-shorten)

⚠️ **BROKEN (What we're fixing):**
1. Scheduled posts showing as 'failed' but actually succeeding
2. Analytics not loading from Ayrshare
3. Social Inbox empty (no messages/comments)
4. Delete not calling Ayrshare (posts stay on platforms)
5. Short links not workspace-branded

### Critical Files (DO NOT BREAK THESE)

```
api/
  ├── post.js ✅ WORKING - Handles posting, scheduling, approval
  ├── auth.js ✅ WORKING - JWT token generation
  ├── workspaces.js ✅ WORKING - Workspace management
  ├── profile-key.js ✅ WORKING - Ayrshare profile key assignment
  ├── drafts.js ✅ WORKING - Draft management
  ├── approve.js ✅ WORKING - Approval workflow
  ├── invite.js ✅ WORKING - Team invitations
  ├── generate-jwt.js ✅ WORKING - Social account JWT
  └── links.js ✅ WORKING - Short link creation

src/components/
  ├── ComposeContent.jsx ✅ WORKING - Compose page
  ├── Schedule.jsx ✅ WORKING - Schedule view
  ├── Approvals.jsx ✅ WORKING - Approval workflow
  └── compose/PostSettings.jsx ✅ WORKING - Phase 4 settings

supabase/
  └── migrations/ - All working database structure
```

---

## 4. Rollback Procedures

### If Code Breaks

**Option A: Git Rollback**
```bash
# Revert to backup branch
git checkout backup-before-fixes-2026-01-30

# Force push to main (ONLY if needed)
git checkout main
git reset --hard backup-before-fixes-2026-01-30
git push -f origin main
```

**Option B: Cherry-pick Specific Commits**
```bash
# Find commit hash from backup tag
git log v1.0-before-fixes

# Reset to that commit
git reset --hard [commit-hash]
git push -f origin main
```

### If Database Breaks

**Option A: Supabase Dashboard Restore**
1. Go to Supabase Dashboard → Database → Backups
2. Find backup from 2026-01-30
3. Click "Restore" button
4. Confirm restoration

**Option B: Manual SQL Restore**
1. Go to Supabase SQL Editor
2. Paste contents of backup_2026-01-30.sql
3. Run queries to restore data

**Option C: Point-in-Time Recovery** (If Supabase Pro)
1. Go to Database → Backups
2. Select "Point-in-Time Recovery"
3. Choose timestamp: 2026-01-30 before fixes
4. Restore

---

## 5. Testing Checklist After Each Fix

After EACH fix, test these critical flows:

### Must Work After Every Change:
- [ ] Login with existing account
- [ ] Create new workspace
- [ ] Invite team member
- [ ] Create draft
- [ ] Load draft and post immediately
- [ ] Schedule post (check status in database)
- [ ] Approve pending post
- [ ] Delete post from schedule

### If ANY of these break:
1. ❌ STOP immediately
2. Document what broke
3. Rollback the specific change
4. Investigate why it broke

---

## 6. Incremental Fix Strategy (One at a Time)

Instead of fixing all 5 issues at once, do ONE at a time:

### Fix Order:
1. **scheduler.js fix** (scheduled posts)
   - Create backup: `git checkout -b fix-scheduler`
   - Make changes
   - Test scheduling
   - If works: merge. If breaks: rollback.

2. **analytics.js** (create new)
   - Create backup: `git checkout -b add-analytics`
   - Add new file (won't break existing)
   - Test analytics
   - If works: merge. If breaks: delete file.

3. **delete.js or update post.js** (delete functionality)
   - Create backup: `git checkout -b fix-delete`
   - Update delete logic
   - Test deletion
   - If works: merge. If breaks: rollback.

4. **inbox webhooks** (create webhook handler)
   - Create backup: `git checkout -b add-inbox-webhooks`
   - Add webhook endpoints
   - Test inbox
   - If works: merge. If breaks: delete endpoints.

5. **links.js enhancement** (workspace branding)
   - Create backup: `git checkout -b enhance-links`
   - Update link generation
   - Test links
   - If works: merge. If breaks: rollback.

---

## 7. Pre-Fix Checklist

Before starting ANY fix:

- [ ] Database backup downloaded
- [ ] Git backup branch created
- [ ] Git tag created
- [ ] ZIP backup created
- [ ] Tested critical flows (login, post, schedule, draft)
- [ ] Documented current state
- [ ] Created feature branch for fix
- [ ] Prepared rollback commands

---

## 8. Emergency Contacts

If something goes catastrophically wrong:

### Vercel Rollback
1. Go to Vercel Dashboard
2. Deployments → Find previous working deployment
3. Click "..." → "Redeploy"

### Supabase Support
- Dashboard: https://supabase.com/dashboard
- Support: https://supabase.com/support

### Git History
```bash
# View all commits
git log --oneline

# View specific file history
git log --oneline api/post.js

# See what changed in a commit
git show [commit-hash]
```

---

## 9. What NOT to Do

❌ **NEVER:**
- Modify `api/auth.js` without backup
- Change `api/generate-jwt.js` without testing
- Alter database RLS policies directly
- Delete migrations without backup
- Force push to main without backup
- Modify core tables (users, workspaces) without backup
- Change anything in production without testing locally first

---

## 10. Success Criteria

A fix is only "done" when:

✅ **ALL of these pass:**
1. Fix works as intended
2. All critical flows still work (login, post, schedule, draft, approve)
3. No new errors in browser console
4. No new errors in Vercel logs
5. Database integrity maintained
6. Git history clean with clear commit messages
7. Code pushed to backup branch first
8. Tested by you before declaring "fixed"

---

**Next Steps:**

1. **STOP** - Do NOT make any changes yet
2. Complete backup checklist above
3. Run test checklist to confirm current working state
4. Create backup branch and tag
5. THEN we can start fixing issues ONE at a time

---

**Created:** 2026-01-30
**Status:** BACKUP REQUIRED BEFORE PROCEEDING
**Priority:** CRITICAL - Do backups first
