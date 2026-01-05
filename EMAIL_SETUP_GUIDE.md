# Email Invitation Setup Guide

## Current Issue
Emails are being saved to Supabase but not received by invitees.

## Root Cause
The Edge Function is trying to send emails from `noreply@woozysocial.com` which hasn't been verified in Resend.

---

## Solution Steps

### 1. Update Resend Configuration

#### Option A: Use Resend Test Email (Quickest for Testing)
- **From Address**: `onboarding@resend.dev` ✅ Already updated in code
- **Limitation**: Can only send to verified emails in Resend dashboard
- **Best for**: Development and testing

#### Option B: Verify Your Domain (Production Ready)
1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Enter your domain (e.g., `yourdomain.com`)
4. Add the DNS records provided by Resend:
   - SPF record
   - DKIM record
   - DMARC record
5. Wait for verification (usually 5-15 minutes)
6. Update the Edge Function's `from` address to: `noreply@yourdomain.com`

---

### 2. Set Resend API Key in Supabase

**Option A: Via Supabase Dashboard (Recommended)**
1. Go to https://supabase.com/dashboard
2. Select your project: `adyeceovkhnacaxkymih`
3. Go to **Settings** → **Edge Functions** → **Secrets**
4. Add a new secret:
   - **Name**: `RESEND_API_KEY`
   - **Value**: Your Resend API key (currently: `re_LkUjQtbF_2wLzkzht7wGXoVToqbwGikJv`)

**Option B: Via CLI**
```powershell
cd social-api-demo
npx supabase secrets set RESEND_API_KEY="your_resend_api_key_here"
```

Or run the provided script:
```powershell
.\set-resend-secret.ps1
```

---

### 3. Deploy the Updated Edge Function

Run the deployment script:
```powershell
.\deploy-edge-function.ps1
```

Or manually:
```powershell
cd social-api-demo
npx supabase functions deploy send-team-invite
```

---

### 4. Test the Invitation Flow

1. **Open your app**: http://localhost:5173
2. **Go to Team page**
3. **Click "Invite Team Member"**
4. **Enter an email address** (use your own email for testing)
5. **Select a role** (e.g., Editor)
6. **Click "Send Invite"**

**Expected Result:**
- Invitation appears in Supabase `team_invitations` table ✅
- Email is received in inbox (or spam folder)

---

### 5. Check Logs if Email Not Received

Run the log checker:
```powershell
.\check-function-logs.ps1
```

Look for:
- ✅ "Invitation sent successfully"
- ❌ "Error sending email" (with details)
- ⚠️ "RESEND_API_KEY not configured"

---

### 6. Common Issues & Solutions

#### Issue: "RESEND_API_KEY not configured"
**Solution**: Set the secret in Supabase (Step 2)

#### Issue: Email goes to spam
**Solution**:
- Verify your domain in Resend
- Set up SPF, DKIM, and DMARC records
- Use a professional from address

#### Issue: "Invalid from address"
**Solution**:
- Use `onboarding@resend.dev` for testing
- Or verify your domain and use `noreply@yourdomain.com`

#### Issue: Resend API error
**Solution**:
- Check API key is valid
- Check you haven't exceeded Resend's free tier limits
- Verify the recipient email is valid

---

### 7. Verify Email Template

The email includes:
- ✅ Professional design with brand colors (#114C5A, #FFC801)
- ✅ Inviter's name
- ✅ Role description
- ✅ Accept invitation button
- ✅ Expiration notice (7 days)
- ✅ Fallback link for email clients without button support

---

### 8. Next Steps After Email Works

Once emails are being received successfully:

1. **Test Accept Invitation Flow** (Phase 5)
   - User receives email
   - Clicks "Accept Invitation"
   - Signs up or logs in
   - Becomes team member

2. **Implement Resend Invitation** (Phase 9)
3. **Add Email Notifications for**:
   - Role changes
   - Member removal
   - Invitation accepted

---

## Environment Variables Checklist

Make sure these are set:

**In `functions/.env` (Local Development):**
```
RESEND_API_KEY=re_LkUjQtbF_2wLzkzht7wGXoVToqbwGikJv
```

**In Supabase Dashboard (Production):**
- ✅ RESEND_API_KEY (Edge Function Secret)
- ✅ SUPABASE_URL
- ✅ SUPABASE_SERVICE_ROLE_KEY
- ✅ APP_URL (for generating invite links)

---

## Testing Checklist

- [ ] Resend API key set in Supabase
- [ ] Edge function deployed
- [ ] Invitation created in database
- [ ] Email received in inbox
- [ ] Email template renders correctly
- [ ] Accept link works
- [ ] Expiration date shows correctly

---

## Support Resources

- **Resend Documentation**: https://resend.com/docs
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
- **Current Edge Function**: `/supabase/functions/send-team-invite/index.ts`
