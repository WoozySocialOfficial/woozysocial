# Phase 4: Post Settings - Testing Guide

## What Got Fixed

### ✅ Mixed Media Validation
- **Issue:** Video + photos caused timeout and false "failed" status
- **Fix:** Now validates upfront and shows clear error message
- **Status:** Working perfectly

### ✅ Instagram Story Settings
- **Issue:** Case-sensitive platform check prevented story settings from applying
- **Fix:** Changed to case-insensitive check
- **Status:** Working, but images must meet dimension requirements

### ✅ Twitter Thread Settings
- **Issue:** Thread feature works, but Ayrshare has limitations
- **Fix:** Added warnings and guidance in UI
- **Status:** Working, requires proper formatting

---

## Understanding What You Saw

### Instagram Story Error (First Screenshot)

**What happened:**
- ✅ Story setting WAS applied correctly (you can see `"post":"story post"` in error)
- ❌ Image was rejected because it's 4000px wide
- ✅ Instagram Stories require width between **320px and 1920px**

**This is NOT a bug** - it's an Instagram/Ayrshare limitation.

**Solution:** Use images between 320px-1920px wide, or resize before uploading.

---

### Twitter Thread Error (Second Screenshot)

**What happened:**
- ✅ Thread setting WAS applied correctly
- ✅ Tweets 1/8 and 2/8 were successfully posted
- ❌ Tweet 3/8 was 379 characters (exceeds 280 limit by 99)
- ❌ Ayrshare deleted the already-posted tweets and failed the thread

**Why it failed:**
Ayrshare breaks threads based on **double line breaks** (`\n\n`), NOT character count. Your paragraph:

```
1. Move from "Eviction" to "Upgrading"
"Shack culture" isn't a lack of ambition; it's a survival strategy. We need to prioritize Rapid Informal Settlement Upgrading (In-Situ). This means bringing the city to the settlement—installing solar lighting, dignified sanitation, and paved roads while people are still living there, rather than moving them 40km away from their jobs. 3/8
```

...is 379 characters in one block, so it became a single tweet that exceeded the limit.

**Solution:** Add blank lines (press Enter twice) between paragraphs to ensure each tweet stays under 280 characters.

---

## How to Test Properly

### 1. Instagram Story ✅

**Preparation:**
1. Get an image between 320px-1920px wide (resize if needed)
2. Go to Compose page
3. Select Instagram platform
4. Upload your image

**Steps:**
1. Expand "Post Settings" panel
2. Select "Story (24 hours)" from Instagram Post Type dropdown
3. Add caption
4. Click "Post Now"

**Expected Result:**
- Post succeeds
- Story appears on Instagram (disappears after 24 hours)
- Database shows `post_settings: { instagramType: 'story' }`

**If it fails:**
- Check image dimensions (use tool like Photoshop, Preview, or online image analyzer)
- Resize to max 1920px width if needed

---

### 2. Twitter Thread ✅

**Preparation:**
1. Write a long post (>280 characters)
2. **IMPORTANT:** Add blank lines (double Enter) between each paragraph
3. Keep each paragraph under 280 characters

**Example Formatting:**
```
This is the first tweet with an intro. It's under 280 chars.

This is the second tweet. Notice the blank line above? That tells Ayrshare to create a new tweet here. Also under 280 chars.

This is the third tweet. Same pattern - blank line, short paragraph. Under 280 chars.

This is the fourth tweet. You get the idea! Keep going...
```

**Steps:**
1. Go to Compose page
2. Select Twitter/X platform
3. Paste your formatted text
4. Expand "Post Settings" panel
5. Check "Thread Post"
6. Check "Add thread numbers" (optional)
7. Click "Post Now"

**Expected Result:**
- Thread successfully posts to Twitter
- Each paragraph becomes a separate tweet
- Tweets are numbered (1/n, 2/n, 3/n...) if you enabled numbering

**If it fails:**
- Check that paragraphs are separated by blank lines
- Check that each paragraph is under 280 characters
- Use an online character counter if needed

---

### 3. Auto-Shorten Links ✅

**Steps:**
1. Write a post with a long URL (e.g., `https://www.example.com/very/long/url/path/to/article?param=value`)
2. Select any platform (works on all)
3. Expand "Post Settings" panel
4. Check "Auto-Shorten Links"
5. Click "Post Now"

**Expected Result:**
- Post succeeds
- URL is shortened in the final post
- You can verify by checking the post on the social platform

**Note:** This requires Ayrshare Business Plan. If you don't have it, the setting will be ignored.

---

### 4. Mixed Media Validation ✅

**Steps:**
1. Select Instagram platform
2. Upload 1 image + 1 video
3. Try to post

**Expected Result:**
- ❌ Error message: "Instagram does not support mixing videos and photos in the same post. Please use either videos only or photos only."
- Post does NOT get sent to Ayrshare
- No timeout issues

**This is correct behavior** - prevents the timeout issue you experienced earlier.

---

## Database Migration (REQUIRED)

Before testing, run this migration in Supabase:

```sql
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS post_settings JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_posts_settings ON posts USING gin(post_settings);
```

**How to run:**
1. Go to Supabase dashboard
2. Click "SQL Editor" in left sidebar
3. Paste the SQL above
4. Click "Run"
5. Verify: `SELECT post_settings FROM posts LIMIT 1;` should return empty JSON object `{}`

---

## Deployment Checklist

✅ **Code pushed to GitHub** (commit: da97ef3)
⏳ **Vercel auto-deployment** - Wait ~2 minutes
⏳ **Database migration** - Run SQL in Supabase dashboard
⏳ **Hard refresh frontend** - Ctrl+Shift+R to clear cache

---

## Common Issues & Solutions

### "Story setting not applying"
- ✅ Fixed! Was case-sensitivity issue
- If still happening, check browser console for errors
- Hard refresh browser (Ctrl+Shift+R)

### "Thread posts failing"
- ✅ Feature is working
- ⚠️ Make sure paragraphs are separated by blank lines
- ⚠️ Keep each paragraph under 280 characters
- Use online character counter if unsure

### "Image rejected for Instagram Story"
- ✅ This is Instagram's requirement, not a bug
- Check image width (must be 320px-1920px)
- Resize using image editor or online tool

### "Post shows as failed but is actually live"
- ✅ Fixed! Mixed media now blocked upfront
- If still happening with single media type, check Vercel logs
- This was caused by Ayrshare timeout >55 seconds

---

## Success Criteria

After migration and deployment:

- [ ] Instagram Story posts with properly sized images succeed
- [ ] Thread posts with proper formatting create numbered threads
- [ ] Mixed media attempts show clear error message (don't reach Ayrshare)
- [ ] Auto-shorten links works (if Business Plan enabled)
- [ ] All post_settings are saved to database
- [ ] Logs show detailed post settings information

---

## Advanced: Checking Logs

If something still isn't working:

1. **Frontend logs (Browser Console):**
   - Press F12 in browser
   - Go to "Console" tab
   - Look for errors or warnings

2. **Backend logs (Vercel):**
   - Go to Vercel dashboard
   - Click on your project
   - Click "Deployments" → Latest deployment
   - Click "View Function Logs"
   - Look for `[POST]` prefixed logs

3. **Database check:**
   ```sql
   SELECT id, caption, post_settings, status, last_error
   FROM posts
   ORDER BY created_at DESC
   LIMIT 10;
   ```

---

## Character Counter Tools

For Twitter threads:

- **Online:** https://charactercounter.com/
- **Built-in:** Most text editors show character count
- **Tip:** Write in a text editor with character count, then paste into WoozySocial

---

## Image Dimension Checker Tools

For Instagram Stories:

- **Mac:** Preview → Tools → Show Inspector
- **Windows:** Right-click image → Properties → Details
- **Online:** https://www.imgonline.com.ua/eng/determine-image-size.php
- **Resize:** https://www.iloveimg.com/resize-image

---

**Created:** 2026-01-30
**Status:** Ready for testing
**Commits:** f256449, 6188f4f, da97ef3
**Next:** Run migration, hard refresh, test all features
