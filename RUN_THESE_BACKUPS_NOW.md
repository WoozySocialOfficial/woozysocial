# Quick Backup Commands - Run NOW Before Fixes

## Copy-Paste These Commands in Order

### 1. Create Backup Directory
```bash
cd c:\Users\mageb\OneDrive\Desktop\woozy(13-01)
mkdir BACKUPS
cd BACKUPS
```

### 2. Git Backup Branch
```bash
cd ..
cd woozysocial

# Create backup branch
git checkout -b backup-2026-01-30-before-critical-fixes
git add -A
git commit -m "Backup before critical fixes: scheduler, analytics, inbox, delete, links"
git push -u origin backup-2026-01-30-before-critical-fixes

# Create tag
git tag -a v1.0-stable-jan30 -m "Stable state before fixes - Login, posting, scheduling, drafts, approvals all working"
git push origin v1.0-stable-jan30

# Return to main
git checkout main
```

### 3. Record Current Commit Hash (for rollback)
```bash
git log --oneline -1
```
**Write down the commit hash here:** _________________________

### 4. Database Backup via Supabase

**Manual Steps:**
1. Open browser: https://supabase.com/dashboard
2. Select your woozysocial project
3. Click "Database" in left sidebar
4. Click "Backups" tab
5. Click "Create backup now" or "Download latest backup"
6. Save file as: `c:\Users\mageb\OneDrive\Desktop\woozy(13-01)\BACKUPS\supabase_backup_2026-01-30.sql`

**Alternative: Export via SQL Editor**
1. Go to Supabase → SQL Editor
2. Run this query and save output:

```sql
-- Critical tables export
COPY (SELECT * FROM posts) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM post_drafts) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM workspaces) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM workspace_members) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM user_profiles) TO STDOUT WITH CSV HEADER;
```

3. Save output to: `c:\Users\mageb\OneDrive\Desktop\woozy(13-01)\BACKUPS\tables_backup_2026-01-30.csv`

---

## Verification Checklist

After running backups, verify:

- [ ] Git backup branch exists: `git branch -a | grep backup-2026-01-30`
- [ ] Git tag exists: `git tag | grep v1.0-stable-jan30`
- [ ] Commit hash recorded: _______________
- [ ] Supabase backup downloaded to BACKUPS folder
- [ ] Backup file is NOT empty (check file size > 0 KB)

---

## Quick Rollback Reference

**If code breaks:**
```bash
cd woozysocial
git checkout backup-2026-01-30-before-critical-fixes
# Or
git reset --hard v1.0-stable-jan30
```

**If deployment breaks:**
1. Go to Vercel dashboard
2. Find previous working deployment
3. Click "Redeploy"

**If database breaks:**
1. Supabase Dashboard → Database → Backups
2. Restore from 2026-01-30 backup

---

## After Backups Complete

✅ Type "backups done" and I'll start with Fix #1 (scheduler)

We'll fix ONE issue at a time and test after each fix.
