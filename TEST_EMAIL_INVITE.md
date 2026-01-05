# Testing Team Invitation Emails

## ✅ Setup Complete

1. **Resend API Key Updated**: `re_SVRZD6Ha_2U4VbeKZWBYRocHyRPhpTdMZ`
2. **Domain**: `woozysocial.com`
3. **From Address**: `hello@woozysocial.com`
4. **Endpoint**: `/api/send-team-invite` in `functions/server.js`

---

## 🚀 Testing Steps

### 1. Restart Backend Server

**IMPORTANT**: You must restart the server to load the new API key!

```powershell
# Stop the current server (Ctrl+C in the terminal where it's running)

# Then restart:
cd functions
npm start
```

Or if using a different terminal:
```powershell
cd social-api-demo/functions
node server.js
```

---

### 2. Start Frontend (if not running)

```powershell
cd social-api-demo
npm run dev
```

---

### 3. Test the Invitation Flow

1. **Open the app**: http://localhost:5173
2. **Login** with your account
3. **Go to Team page** (should be in the sidebar)
4. **Click "Invite Team Member"** button
5. **Fill in the form**:
   - Email: Use your own email or a test email
   - Role: Select any role (admin, editor, view_only)
6. **Click "Send Invite"**

---

### 4. Expected Results

**✅ Success Indicators:**
- Modal closes
- Success toast/message appears
- Invitation appears in the "Pending Invitations" section
- **Email received** with:
  - From: `Social Media Team <hello@woozysocial.com>`
  - Subject: "[Inviter] invited you to join their team"
  - Beautiful HTML template with brand colors
  - "Accept Invitation" button

**Check your inbox AND spam folder!**

---

### 5. Verify in Database

You can check Supabase to see the invitation:

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Table Editor** → **team_invitations**
4. You should see the new invitation with:
   - `status: 'pending'`
   - `email: [the email you entered]`
   - `role: [the role you selected]`
   - `invite_token: [UUID]`

---

### 6. Check Server Logs

In your backend terminal, you should see:
```
Invitation created successfully: [UUID]
Email sent successfully: { id: '...' }
```

If you see errors, check:
- ✅ RESEND_API_KEY is set correctly in `.env`
- ✅ Domain `woozysocial.com` is verified in Resend
- ✅ Server was restarted after updating `.env`

---

## 🐛 Troubleshooting

### Email Not Received

**Check 1: Is the domain verified?**
- Login to https://resend.com/domains
- Verify `woozysocial.com` status is "Verified" (green checkmark)

**Check 2: Check Resend Dashboard**
- Go to https://resend.com/emails
- Check if the email shows as "Delivered" or has an error

**Check 3: Server Logs**
- Look for "Error sending email:" in the terminal
- Look for the error details

**Check 4: Spam Folder**
- Sometimes new domains' emails go to spam initially

### Invitation Not Created in Database

**Check 1: RLS Policies**
- Make sure `team_invitations` table exists
- Check Row Level Security policies allow inserts

**Check 2: User Authentication**
- Make sure you're logged in
- Check `userId` is being passed correctly

---

## 📧 Email Template Preview

Your email will look like this:

```
┌─────────────────────────────────────┐
│      [Dark Teal Background]         │
│      You're Invited!                │
│      [Yellow Text]                  │
└─────────────────────────────────────┘

Hi there,

[inviter@email.com] has invited you to join
their team as a Editor.

┌─────────────────────────────────────┐
│ Your Role:                          │
│ Can create, edit, and delete posts  │
└─────────────────────────────────────┘

Click the button below to accept this
invitation and get started:

┌─────────────────────┐
│  Accept Invitation  │ [Yellow Button]
└─────────────────────┘

This invitation will expire in 7 days.
```

---

## ✅ Next Steps After Email Works

Once emails are successfully sending:

1. **Test the Accept Invitation Flow** (Phase 5)
   - Click the "Accept Invitation" button in email
   - Verify it goes to `/accept-invite?token=...`
   - Implement the accept flow (if not done yet)

2. **Test Different Scenarios**:
   - Inviting existing member (should fail)
   - Inviting with invalid email (should fail)
   - Inviting yourself (should fail)
   - Multiple invitations to same email (should fail)

3. **Continue Team Management Implementation**:
   - Phase 6: Display team members list
   - Phase 7: Change member roles
   - Phase 8: Remove members
   - Phase 9: Resend invitations

---

## 🔑 Configuration Summary

**File**: `functions/.env`
```
RESEND_API_KEY=re_SVRZD6Ha_2U4VbeKZWBYRocHyRPhpTdMZ
```

**File**: `functions/server.js` (line 801)
```javascript
from: 'Social Media Team <hello@woozysocial.com>'
```

**Resend Domain**: `woozysocial.com` ✅ Verified

---

## 📞 Support

If emails still aren't sending after these steps:

1. Check Resend dashboard for delivery status
2. Verify DNS records are correct for woozysocial.com
3. Check server logs for specific error messages
4. Try sending a test email from Resend dashboard directly

**Remember**: After any `.env` changes, you MUST restart the backend server!
