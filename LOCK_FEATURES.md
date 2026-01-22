# 🔒 LOCKED FEATURES - DO NOT MODIFY

This document lists critical features that are working perfectly and should NOT be modified without careful consideration and testing.

Breaking these features can result in users being unable to sign up, pay, or access the application.

---

## 🚨 CRITICAL: SIGNUP FLOW - LOCKED

**Status:** ✅ Working perfectly
**Last Verified:** 2026-01-22
**Lock Reason:** Complex multi-system integration that took extensive debugging to get right

### What This System Does:

The signup flow is a critical path that integrates multiple systems:
1. Marketing site signup form → API account creation
2. Stripe payment processing → Webhook handling
3. Ayrshare profile creation → Database updates
4. Login token generation → Auto-login to app

### Files That Are LOCKED (Do Not Modify):

#### Marketing Site:
- ✅ `views/success.html` - Handles post-payment redirect and login token processing
  - **Critical:** Lines 59-109 (JavaScript that calls complete-onboarding endpoint)
  - **DO NOT CHANGE:** The way it accesses `data.data.loginToken`

#### API Backend (woozysocial):
- ✅ `api/signup/create-account.js` - Creates user account and workspace
  - **Critical:** Lines 242-243 (Tier name normalization: `selectedTier.replace(/-/g, '_')`)
  - **Why:** Database expects underscores (pro_plus) but frontend sends hyphens (pro-plus)

- ✅ `api/stripe/create-checkout-session-onboarding.js` - Creates Stripe checkout
  - **Critical:** Lines 79-120 (Workspace name handling and metadata)
  - **Critical:** Lines 187-204 (Checkout session creation with metadata)
  - **Why:** Webhook needs `workspace_name` and `workspace_id` in metadata

- ✅ `api/stripe/webhook.js` - Handles Stripe payment webhooks
  - **Critical:** Lines 300-450 (checkout.session.completed handler for onboarding)
  - **Critical:** Lines 68-135 (createAyrshareProfile function)
  - **Critical:** Lines 350-370 (Tier name normalization in webhook)
  - **Why:** Creates Ayrshare profiles and updates workspace/user to active

- ✅ `api/signup/complete-onboarding.js` - Generates login token after payment
  - **Critical:** Lines 54-135 (Login token generation)
  - **Why:** Enables automatic login after payment

- ✅ `api/auth/token-login.js` - Validates login token and logs user in
  - **Critical:** Lines 40-152 (Token validation and magic link generation)
  - **Why:** Final step to get user into the app

#### Database Constraints (Supabase):
- ✅ `workspaces.subscription_tier` - CHECK constraint
  - **Allowed values:** `['free', 'solo', 'pro', 'pro_plus', 'agency', 'brand_bolt', 'enterprise']`
  - **Critical:** Must include `'pro_plus'` (with underscore, not hyphen)

- ✅ `workspaces.onboarding_status` - CHECK constraint
  - **Allowed values:** `['pending_payment', 'payment_completed', 'completed', 'profile_creation_failed']`
  - **Critical:** Must include `'profile_creation_failed'` for webhook error handling

---

## 🔐 Protection Rules:

### Before Modifying ANY Signup-Related Code:

1. **READ THIS FIRST:** Review the `COMPLETE_SIGNUP_FIX.md` document to understand the full flow
2. **TEST LOCALLY:** Never deploy signup changes without testing the complete flow
3. **CHECK DEPENDENCIES:** Ensure your change doesn't break the tier normalization
4. **VERIFY METADATA:** Don't remove or rename metadata fields in checkout sessions
5. **TEST WEBHOOK:** Always test that webhooks still fire correctly after changes
6. **VERIFY AYRSHARE:** Check that Ayrshare profile creation still works

### Complete Signup Test Checklist:

Before deploying ANY changes that touch signup-related files:

- [ ] Create a new test user account
- [ ] Verify account creation succeeds
- [ ] Complete payment with test card (4242 4242 4242 4242)
- [ ] Verify Stripe webhook fires successfully
- [ ] Check Ayrshare profile was created in workspace
- [ ] Confirm workspace marked as active with subscription tier
- [ ] Verify user is automatically logged into the app
- [ ] Check database shows correct values:
  - `subscription_tier` = 'pro_plus' (or selected tier)
  - `subscription_status` = 'active'
  - `onboarding_status` = 'completed'
  - `ayr_profile_key` is NOT NULL
  - `onboarding_completed` = true

### What Can Break The Signup Flow:

❌ **DO NOT:**
- Change tier names without updating BOTH frontend, API, and database constraints
- Remove or rename metadata fields in Stripe checkout sessions
- Change the response structure of `complete-onboarding` endpoint
- Modify how `success.html` accesses the login token
- Change database constraints without updating webhook logic
- Remove tier normalization logic (hyphen to underscore conversion)
- Change webhook event handling for `checkout.session.completed`
- Modify Ayrshare profile creation logic without extensive testing

✅ **SAFE TO DO:**
- Add NEW fields to metadata (don't remove existing ones)
- Add NEW onboarding statuses (don't remove existing ones)
- Add logging and monitoring
- Improve error messages (as long as response structure stays the same)
- Add NEW features that don't touch the critical path

---

## 📝 Change Log:

### 2026-01-22: Initial Lock
- **Reason:** Spent entire day debugging signup flow issues
- **Issues Fixed:**
  1. Tier normalization (pro-plus → pro_plus)
  2. Workspace name missing in webhook metadata
  3. Ayrshare profile creation failing
  4. Database constraints missing values
  5. Login token access path in success page
- **Result:** Complete signup flow working perfectly
- **Deployed Commits:**
  - Marketing: `ba0d2ea` - Fix login token access
  - API: `0fb3189` - Fix tier normalization

---

## 🚀 If You MUST Modify Signup Flow:

1. **Create a feature branch** - Never work directly on main
2. **Read all documentation** - COMPLETE_SIGNUP_FIX.md, TOKEN_LOGIN_IMPLEMENTATION.md, etc.
3. **Understand the flow** - Review the webhook logs to see how it works
4. **Make small changes** - Don't refactor everything at once
5. **Test thoroughly** - Use the checklist above
6. **Test on staging first** - Never deploy directly to production
7. **Monitor after deploy** - Watch Vercel logs for webhook errors
8. **Have rollback ready** - Know the git commit to revert to

---

## 📞 Emergency Contacts:

If signup flow breaks in production:

1. **Check Vercel Logs:**
   - Go to: https://vercel.com/marcell-liebenbergs-projects/woozysocial/logs
   - Filter: `/api/stripe/webhook`
   - Look for errors in `checkout.session.completed` events

2. **Check Ayrshare Dashboard:**
   - Go to: https://app.ayrshare.com/
   - Verify: Profile creation quota not exceeded
   - Check: API key is still valid

3. **Quick Rollback:**
   ```bash
   # API rollback
   cd woozysocial
   git revert HEAD
   git push

   # Marketing site rollback
   cd woozysocial-marketing
   git revert HEAD
   git push
   ```

4. **Known Working Commits:**
   - API: `0fb3189` - "Fix tier name normalization in signup"
   - Marketing: `ba0d2ea` - "Fix login token access in success page"

---

## ✅ Other Working Features (May Add More Later):

_This section is for other critical features that should be locked once they're working perfectly._

---

**Remember:** It took a full day to get signup working. Don't break it! 🙏
