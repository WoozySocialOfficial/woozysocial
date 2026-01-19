# Engagement Page Testing Guide

## Overview
The Engagement page allows users to view and respond to comments on their social media posts across all connected platforms (Facebook, Instagram, LinkedIn, YouTube, TikTok).

---

## API Endpoints Created

### 1. GET /api/comments/[postId]
**Purpose:** Fetch all comments for a specific post

**Query Parameters:**
- `workspaceId` (required): The workspace UUID
- `postId` (URL parameter): The Ayrshare post ID
- `platform` (optional): Specific platform filter

**Response:**
```json
{
  "success": true,
  "data": {
    "comments": [
      {
        "id": "comment_123",
        "message": "Great post!",
        "from": {
          "name": "John Doe",
          "id": "user_456"
        },
        "created_time": "2024-01-19T10:30:00Z",
        "platform": "facebook",
        "comments": []  // Nested replies
      }
    ],
    "postId": "post_789",
    "count": 1
  }
}
```

### 2. POST /api/comments/reply/[commentId]
**Purpose:** Reply to a specific comment

**Request Body:**
```json
{
  "workspaceId": "workspace-uuid",
  "postId": "post_789",
  "commentId": "comment_123",
  "reply": "Thank you for your feedback!",
  "platform": "facebook"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reply": {
      "id": "reply_456",
      "message": "Thank you for your feedback!",
      "commentId": "comment_123",
      "postId": "post_789"
    }
  }
}
```

### 3. POST /api/comments
**Purpose:** Post a new comment on a post (not a reply)

**Request Body:**
```json
{
  "workspaceId": "workspace-uuid",
  "postId": "post_789",
  "comment": "Checking in on this post!",
  "platform": "facebook"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "comment": {
      "id": "comment_999",
      "message": "Checking in on this post!",
      "postId": "post_789"
    }
  }
}
```

### 4. DELETE /api/comments/delete/[commentId]
**Purpose:** Delete a comment

**Query Parameters:**
- `workspaceId` (required): The workspace UUID
- `commentId` (URL parameter): The comment ID to delete
- `postId` (optional): Post ID for context
- `platform` (optional): Platform (defaults to facebook)

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "commentId": "comment_123",
    "message": "Comment deleted successfully"
  }
}
```

---

## Testing Steps

### Prerequisites
1. Ensure you have posts created through Ayrshare (via the Publish page)
2. Ensure those posts have received comments on the actual platforms
3. Have workspace connected to Ayrshare with valid profile key
4. Backend deployed and accessible at `https://api.woozysocial.com`

### Step 1: Test Comment Fetching

1. **Navigate to Engagement Page**
   - Go to: https://woozysocial.com
   - Login with your account
   - Select a workspace with connected social accounts
   - Click "Engagement" in sidebar

2. **Select a Post**
   - Click on a post from the list
   - Verify comments load in the right panel
   - Check that comment counts match

3. **Verify Comment Structure**
   - Comments should show:
     - Commenter name and avatar
     - Comment text
     - Platform badge
     - Timestamp
     - Nested replies (if any)

4. **Test Platform Filtering**
   - Use platform filter dropdown
   - Verify only comments from selected platform appear
   - Test "All Platforms" option

### Step 2: Test Replying to Comments

1. **Reply to a Comment**
   - Click "Reply" button on a comment
   - Type your response
   - Click "Send Reply"
   - Verify success message appears

2. **Verify Reply on Platform**
   - Go to the actual social media platform
   - Check the original post
   - Verify your reply appears under the comment

3. **Test Reply on Different Platforms**
   - Reply to Facebook comment
   - Reply to Instagram comment
   - Reply to LinkedIn comment
   - Verify each platform handles replies correctly

### Step 3: Test Comment Deletion (if implemented in UI)

1. **Delete a Comment**
   - Find a comment you want to delete
   - Click delete/trash icon
   - Confirm deletion
   - Verify comment disappears from list

2. **Verify on Platform**
   - Check the social media platform
   - Confirm comment is actually deleted

### Step 4: Test Error Handling

1. **Test with No Comments**
   - Select a post with no comments
   - Verify "No comments yet" message appears

2. **Test with Invalid Post**
   - Manually navigate to invalid post ID
   - Verify error handling

3. **Test Network Errors**
   - Disable network temporarily
   - Try to load comments
   - Verify error message shows

---

## Manual API Testing

### Using cURL

**Fetch Comments:**
```bash
curl "https://api.woozysocial.com/api/comments/POST_ID?workspaceId=WORKSPACE_ID"
```

**Reply to Comment:**
```bash
curl -X POST "https://api.woozysocial.com/api/comments/reply/COMMENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "WORKSPACE_ID",
    "postId": "POST_ID",
    "reply": "Test reply from API",
    "platform": "facebook"
  }'
```

**Delete Comment:**
```bash
curl -X DELETE "https://api.woozysocial.com/api/comments/delete/COMMENT_ID?workspaceId=WORKSPACE_ID&platform=facebook"
```

### Using Browser Console

Navigate to https://woozysocial.com, login, and run:

```javascript
// Get workspace ID from localStorage
const workspaceId = localStorage.getItem('activeWorkspaceId');

// Fetch comments for a post
fetch(`https://api.woozysocial.com/api/comments/POST_ID?workspaceId=${workspaceId}`)
  .then(r => r.json())
  .then(data => console.log('Comments:', data));

// Reply to a comment
fetch('https://api.woozysocial.com/api/comments/reply/COMMENT_ID', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspaceId: workspaceId,
    postId: 'POST_ID',
    reply: 'Test reply',
    platform: 'facebook'
  })
})
.then(r => r.json())
.then(data => console.log('Reply sent:', data));
```

---

## Expected Behavior

### Comments Display
- Comments should load within 2-3 seconds
- Comments ordered by newest first (or platform default)
- Nested replies indented properly
- Platform badges show correct colors
- Timestamps formatted correctly

### Reply Functionality
- Reply button visible on all comments
- Reply text area appears on click
- Character count shows (if applicable)
- Send button disabled until text entered
- Success message after reply sent
- Reply appears in thread immediately (optimistic update)

### Error Messages
- Clear error messages for API failures
- Validation errors for empty replies
- Network error handling
- Rate limit warnings (if applicable)

---

## Troubleshooting

### Issue: No Comments Loading

**Check:**
1. Post actually has comments on the platform
2. Ayrshare API key is valid
3. Workspace has correct `ayr_profile_key`
4. Check browser console for errors
5. Check Vercel function logs

**Solution:**
```sql
-- Verify workspace has profile key
SELECT id, name, ayr_profile_key FROM workspaces WHERE id = 'YOUR_WORKSPACE_ID';
```

### Issue: Cannot Send Replies

**Check:**
1. Ayrshare API key has write permissions
2. Comment ID is valid
3. Platform supports replies (some platforms have restrictions)
4. Rate limits not exceeded

**Debug:**
- Check Vercel function logs for `/api/comments/reply/*`
- Test Ayrshare API directly via their dashboard
- Verify response from Ayrshare includes success status

### Issue: Comments Not Updating in Real-Time

**Expected Behavior:**
- Comments are fetched fresh each time you select a post
- No automatic polling (unlike Social Inbox)
- Manual refresh needed to see new comments

**Solution:**
- Add a "Refresh" button to force re-fetch
- Or implement polling like Social Inbox (30-60 second interval)

---

## Platform-Specific Notes

### Facebook
- Supports nested replies (comments on comments)
- No time window restrictions
- Can delete own comments only

### Instagram
- Limited reply functionality via API
- Comments must be on business accounts
- Some comments may not be accessible via API (private accounts)

### LinkedIn
- Supports comments and replies
- No nested comment threads (flat structure)
- Comments limited to company pages with admin access

### YouTube
- Supports threaded comments
- Can reply to top-level comments
- Moderation settings may affect comment visibility

### TikTok
- Limited comment API access
- May require special permissions
- Check Ayrshare documentation for current support level

---

## Monitoring

### Things to Monitor After Deployment

1. **API Response Times**
   - Comments should load within 2-3 seconds
   - Replies should send within 1-2 seconds

2. **Error Rates**
   - Check Vercel function logs for 5xx errors
   - Monitor Ayrshare API failures

3. **User Feedback**
   - Are comments displaying correctly?
   - Are replies being sent successfully?
   - Any platform-specific issues?

---

## Success Checklist

- [ ] Can view posts in Engagement page
- [ ] Clicking a post loads its comments
- [ ] Comments show correct data (name, text, time, platform)
- [ ] Can reply to comments
- [ ] Replies appear on actual platforms
- [ ] Platform filtering works
- [ ] Error messages display correctly
- [ ] No console errors
- [ ] Comments from all platforms display
- [ ] Nested replies render correctly

---

## Related Documentation

- [Quick Production Setup](QUICK_PRODUCTION_SETUP.md)
- [Vercel Deployment Steps](VERCEL_DEPLOYMENT_STEPS.md)
- [Social Inbox Testing Guide](SOCIAL_INBOX_TESTING_GUIDE.md)
- [Ayrshare API Documentation](https://docs.ayrshare.com/)

---

## 🎉 Ready to Test!

Once all endpoints are deployed, the Engagement page should be fully functional for viewing and responding to comments across all your connected social media platforms!
