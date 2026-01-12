# Woozy Social - Project Context for Claude Code

> **IMPORTANT**: This file is read by Claude Code. All developers must keep this updated when making architectural decisions.

## Project Overview
Woozy Social is a social media management platform built by Creative Crew Studio. It serves as a white-label solution for managing client social media accounts with integrated subscription billing.

## Tech Stack
<!-- Update these with your actual stack -->
- Frontend: [React/Vue/Next.js - specify yours]
- Backend: [Node.js/Python - specify yours]
- Database: [PostgreSQL/MongoDB - specify yours]
- API Integrations:
  - **Ayrshare** - Social media posting, scheduling, analytics
  - **Stripe** - Payments, subscriptions, customer portal

---

## 🔒 CRITICAL - DO NOT MODIFY WITHOUT TEAM DISCUSSION

### Protected Files/Folders
List files that should not be refactored or significantly changed:
- '/private key file
- `/config/ayrshare.js` (or your config file path)
- `/config/stripe.js` (or your config file path)
- `/services/socialApi.js` (or your API service path)
- `/services/billing.js` (or your billing service path)
- `/webhooks/stripe.js` (Stripe webhook handler)
- `/webhooks/ayrshare.js` (Ayrshare webhook handler)
- `.env` and `.env.example`

### Established Patterns
<!-- Document patterns both devs have agreed on -->
- Error handling approach: [find issue before changing]
- API response format: [find issue before changing]
- State management: [find issue before changing]
- Webhook processing: [find issue before changing]

---

## Current Development Focus

### Developer 1: [Bohlale Shasha]
- Working on: [feature/module]
- Branch: [main]
- Files primarily editing:
  - schedule -> ScheduleContent.jsx, post-history.js
  - posting -> post.js, SocialPostingForm.jsx, PostContent.jsx, approve.js, pending-approvals.js
  -connecting social media  -> SocialAccounts.jsx, generate-jwt.js, disconnect.js, user-accounts.js

### Developer 2: [Phiwo]
- Working [testBranch]
- Files primarily editing:
  -  team management -> TeamContent.jsx, InviteMemberModal.jsx, memberss.js, send-team-invite.js, accept-invite.js, remove-member.js, update-role.js
  -  security -> AuthContext.jsx, LoginPage.jsx, SignUpPage.jsx, ProtectedRoute.jsx, WorkspaceContext.jsx, utils.js
  -  notifications -> NotificationBell.jsx, create.js, list.js, send-approval-request.js, helpers.js
  -

---

## 📚 AYRSHARE API REFERENCE

### Documentation Links
- Main Docs: https://www.ayrshare.com/docs/introduction
- API Overview: https://www.ayrshare.com/docs/apis/overview
- Quick Start: https://www.ayrshare.com/docs/quickstart
- Business Plan (Multi-user): https://www.ayrshare.com/docs/multiple-users/business-plan-overview
- Postman Collection: https://www.postman.com/ayrshare/ayrshare-social-media-api/documentation/niov8vf/ayrshare-social-media-api
- TEAM_MANAGEMENT_ROADMAP.md
- SUPSCRIPTION_IMPLEMENTATION_ROADMAP.md
- STEPS_TO_RELEASE.md

### Base Configuration
```
Base URL: https://api.ayrshare.com/api
Auth Header: Authorization: Bearer {API_KEY}
Profile Header: Profile-Key: {PROFILE_KEY}  (Business/Enterprise plans only)
Content-Type: application/json
```

### Supported Platforms (13 total)
Bluesky, Facebook, Google Business Profile, Instagram, LinkedIn, Pinterest, Reddit, Snapchat, Telegram, Threads, TikTok, X (Twitter), YouTube

### Key Endpoints We Use
<!-- Check which you're using -->
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/post` | POST | Create/schedule posts |
| `/post` | DELETE | Delete posts |
| `/post` | PATCH | Update post (approval workflow) |
| `/history` | GET | Get post history |
| `/analytics/post` | GET | Get post analytics |
| `/analytics/social` | GET | Get account analytics |
| `/comments` | GET/POST/DELETE | Manage comments |
| `/profiles/create-profile` | POST | Create user profile (Business plan) |
| `/profiles` | GET | List user profiles |
| `/user` | GET | Get user/account info |
| `/generate/jwt` | POST | Generate JWT for SSO linking |

### Post Request Example
```javascript
// Basic post
const response = await fetch('https://api.ayrshare.com/api/post', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.AYRSHARE_API_KEY}`,
    'Content-Type': 'application/json',
    'Profile-Key': profileKey  // Only for Business/Enterprise
  },
  body: JSON.stringify({
    post: "Your post content here",
    platforms: ["facebook", "instagram", "linkedin"],
    mediaUrls: ["https://example.com/image.jpg"],  // Optional
    scheduleDate: "2026-07-08T12:30:00Z"  // Optional - ISO 8601 format
  })
});
```

### Platform-Specific Content
```javascript
// Different content per platform
{
  "post": {
    "instagram": "Great IG pic! #instagram",
    "facebook": "Check this out on Facebook!",
    "default": "Default text for other platforms"
  },
  "platforms": ["instagram", "facebook", "linkedin"],
  "mediaUrls": {
    "instagram": "https://example.com/square-image.jpg",
    "default": "https://example.com/standard-image.jpg"
  }
}
```

### Business Plan - User Profile Flow
1. Create profile: `POST /profiles/create-profile` → Returns `profileKey`
2. Generate JWT: `POST /generate/jwt` with profileKey → Returns SSO URL
3. User links social accounts via SSO URL
4. Use `Profile-Key` header for all subsequent API calls for that user

### Ayrshare Webhooks
Configure in dashboard for real-time updates:
- Post status changes
- Comment notifications
- Message notifications

### Important Notes
- Use ISO 8601 / UTC time format: `YYYY-MM-DDThh:mm:ssZ`
- Enable compression for `/history` endpoint: `Accept-Encoding: deflate, gzip, br`
- Store Profile Keys securely - they grant full access to user's social accounts
- Test posts: Use `randomPost: true` and `randomMediaUrl: true` for testing

---

## 💳 STRIPE API REFERENCE

### Documentation Links
- Billing Overview: https://docs.stripe.com/billing
- Subscriptions Guide: https://docs.stripe.com/billing/subscriptions/overview
- Build Subscriptions: https://docs.stripe.com/billing/subscriptions/build-subscriptions
- Customer Portal: https://docs.stripe.com/customer-management/integrate-customer-portal
- Webhooks: https://docs.stripe.com/billing/subscriptions/webhooks
- API Reference: https://docs.stripe.com/api/subscriptions

### Core Concepts
```
Product → What you sell (e.g., "Woozy Social Pro Plan")
Price → How much & how often (e.g., £29/month)
Customer → The paying user
Subscription → Links Customer to Price(s)
Invoice → Generated automatically for each billing cycle
PaymentIntent → Handles the actual payment
```

### Subscription Statuses
| Status | Meaning | Action |
|--------|---------|--------|
| `trialing` | In trial period | Full access |
| `active` | Paid and current | Full access |
| `past_due` | Payment failed, retrying | Warn user, may limit access |
| `unpaid` | All retries failed | Restrict access |
| `canceled` | Subscription ended | Revoke access |
| `incomplete` | First payment pending | Limited/no access |
| `incomplete_expired` | First payment failed | No access |

### Essential Webhook Events
**MUST handle these:**
```javascript
// Subscription lifecycle
'customer.subscription.created'     // New subscription - grant access
'customer.subscription.updated'     // Plan changed - adjust access
'customer.subscription.deleted'     // Canceled - revoke access
'customer.subscription.trial_will_end'  // 3 days before trial ends

// Payment events
'invoice.paid'                      // Payment successful
'invoice.payment_failed'            // Payment failed - notify user
'invoice.upcoming'                  // Invoice coming soon (for usage tracking)

// Customer portal events
'customer.updated'                  // Customer info changed
'payment_method.attached'           // New payment method added
```

### Webhook Handler Pattern
```javascript
// Example webhook handler structure
app.post('/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'customer.subscription.created':
      // Grant access to user
      break;
    case 'customer.subscription.deleted':
      // Revoke access
      break;
    case 'invoice.payment_failed':
      // Notify user, maybe restrict features
      break;
    // ... handle other events
  }

  res.json({ received: true });
});
```

### Create Subscription
```javascript
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: priceId }],
  payment_behavior: 'default_incomplete',  // Recommended
  expand: ['latest_invoice.payment_intent'],
});
```

### Customer Portal Session
```javascript
const session = await stripe.billingPortal.sessions.create({
  customer: customerId,
  return_url: 'https://yourapp.com/account',
});
// Redirect user to session.url
```

### Important Notes
- Always verify webhook signatures
- Process webhooks asynchronously (return 200 quickly)
- Webhooks may arrive out of order - handle idempotently
- Use test mode keys during development: `sk_test_...`
- Customer Portal must be configured in Stripe Dashboard first

---

## 🔗 INTEGRATION PATTERNS

### User Onboarding Flow
1. User signs up → Create Stripe Customer
2. User selects plan → Create Stripe Checkout Session or Subscription
3. Payment succeeds → `customer.subscription.created` webhook fires
4. Create Ayrshare Profile → `POST /profiles/create-profile`
5. Generate SSO link → `POST /generate/jwt`
6. User links social accounts → Ready to post!

### Subscription + Ayrshare Profile Mapping
```javascript
// Store this relationship in your database
{
  stripeCustomerId: 'cus_xxx',
  stripeSubscriptionId: 'sub_xxx',
  ayrshareProfileKey: 'profile_xxx',
  planTier: 'pro',  // Maps to feature limits
  userId: 'user_xxx'
}
```

### Feature Gating by Plan
```javascript
const PLAN_LIMITS = {
  starter: { platforms: 3, scheduledPosts: 10, analytics: false },
  pro: { platforms: 7, scheduledPosts: 100, analytics: true },
  agency: { platforms: 13, scheduledPosts: 'unlimited', analytics: true }
};
```

---

## Architecture Decisions Log

| Date | Decision | Rationale | Made By |
|------|----------|-----------|---------|
| YYYY-MM-DD | Example: Using Stripe Checkout vs custom payment form | Faster implementation, PCI compliance handled | [Name] |
| YYYY-MM-DD | Example: Ayrshare Business Plan for multi-tenant | Each client gets own profile key, isolated data | [Name] |
| | | | |

---

## Environment Variables Required
```bash
# Ayrshare
AYRSHARE_API_KEY=           # Primary profile API key
AYRSHARE_WEBHOOK_SECRET=    # For verifying webhooks (if using)

# Stripe
STRIPE_SECRET_KEY=          # sk_test_... or sk_live_...
STRIPE_PUBLISHABLE_KEY=     # pk_test_... or pk_live_...
STRIPE_WEBHOOK_SECRET=      # whsec_... from Stripe Dashboard
STRIPE_PRICE_ID_STARTER=    # price_xxx for starter plan
STRIPE_PRICE_ID_PRO=        # price_xxx for pro plan
STRIPE_PRICE_ID_AGENCY=     # price_xxx for agency plan
```

---

## Known Issues / Technical Debt
<!-- Keep Claude aware of known problems -->
- schedule and posting function 
- team management system for both the client and end user(owner)

---

## Claude Code Instructions

### When working on this project:
1. **Always check this file first** for context
2. **Do not modify files listed in "Protected Files"** without explicit instruction
3. **Follow established patterns** documented above
4. If suggesting architectural changes, **note them for discussion** rather than implementing directly
5. **Check the API reference sections** before implementing Ayrshare or Stripe features
6. **Handle webhooks idempotently** - they may be delivered multiple times
7. Make sure that u fact check 

### Coding standards:
- [Add your linting/formatting preferences]
- [Add naming conventions]
- [Add commenting requirements]

### Hard Rules:
- NEVER hardcode API keys or secrets
- NEVER modify webhook handlers without team discussion
- ALWAYS verify Stripe webhook signatures
- ALWAYS use Profile-Key header for Ayrshare multi-user operations
- ALWAYS handle subscription status changes to gate features appropriately
