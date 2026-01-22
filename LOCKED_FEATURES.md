# LOCKED FEATURES - DO NOT MODIFY

These features are working and should NOT be touched unless explicitly requested by the project owner.

## Locked Features

### 1. Approval Workflow Tier Check
- **File**: `api/post/approve.js`
- **Lines**: 136-176
- **Status**: WORKING
- **Description**: Client approval workflow with tier check bypass for client users

### 2. Generate JWT / Social Account Connection
- **File**: `api/generate-jwt.js`
- **Status**: WORKING
- **Description**: Ayrshare JWT generation with workspace profile key lookup

### 3. Brand Profile Query
- **File**: `src/hooks/useQueries.js` (useBrandProfile function)
- **File**: `src/components/BrandProfileContent.jsx`
- **Status**: WORKING
- **Description**: Brand profile fetching and saving using workspace_id

### 4. Favicon and Logo
- **Files**: `public/assets/woozysocial.png`, `public/assets/favicon-32x32.png`
- **File**: `index.html`
- **Status**: WORKING
- **Description**: App logo and favicon

### 5. Post Drafts Auto-Save
- **File**: `src/components/ComposeContent.jsx`
- **Status**: DISABLED (RLS issues)
- **Description**: Auto-save draft functionality - disabled due to Supabase RLS infinite recursion

### 6. Stripe Webhook / Payment Processing
- **File**: `api/stripe-webhook.js`
- **Status**: WORKING
- **Description**: Handles subscription payments and Ayrshare profile creation

### 7. Ayrshare Profile Creation
- **File**: `api/_utils.js` (createAyrshareProfile function)
- **Status**: WORKING
- **Description**: Creates Ayrshare profiles for new workspaces

### 8. Workspace Context
- **File**: `src/contexts/WorkspaceContext.jsx`
- **Status**: WORKING
- **Description**: Workspace switching and active workspace management

### 9. Authentication Context
- **File**: `src/contexts/AuthContext.jsx`
- **Status**: WORKING
- **Description**: User authentication, profile, and subscription status

### 10. Post Creation / Scheduling
- **File**: `api/post/create.js`
- **File**: `src/components/ComposeContent.jsx` (posting logic only)
- **Status**: WORKING
- **Description**: Creating and scheduling posts to social platforms

### 11. Connected Accounts / User Accounts
- **File**: `api/user-accounts.js`
- **File**: `src/hooks/useQueries.js` (useConnectedAccounts)
- **Status**: WORKING
- **Description**: Fetching connected social media accounts

### 12. Team Management
- **File**: `src/components/TeamContent.jsx`
- **File**: `api/team/*.js`
- **Status**: WORKING
- **Description**: Workspace team member management

### 13. Client Portal
- **File**: `src/components/ClientDashboard.jsx`
- **File**: `src/components/ClientApprovalPage.jsx`
- **Status**: WORKING
- **Description**: Client view for approving posts

### 14. Access Control Utilities
- **File**: `api/_utils-access-control.js`
- **Status**: WORKING
- **Description**: Tier permissions, role permissions, feature flags

### 15. Subscription Tiers / Constants
- **File**: `src/utils/constants.js`
- **Status**: WORKING
- **Description**: Subscription tier definitions and feature limits

### 16. Navigation / Routing
- **File**: `src/App.jsx`
- **File**: `src/components/layout/LeftNav.jsx`
- **Status**: WORKING
- **Description**: App routing and navigation

### 17. Posting to Platforms
- **File**: `api/post/post.js`
- **Status**: WORKING
- **Description**: Sending posts to Ayrshare/social platforms

### 18. Fix Ayrshare Profile Endpoint
- **File**: `api/fix-ayrshare-profile.js`
- **Status**: WORKING
- **Description**: Fixes workspaces missing Ayrshare profile keys

### 19. Social Accounts Page
- **File**: `src/components/SocialAccounts.jsx`
- **Status**: WORKING
- **Description**: Connect/disconnect social media accounts UI

### 20. Dashboard Content
- **File**: `src/components/DashboardContent.jsx`
- **Status**: WORKING
- **Description**: Main dashboard with stats and quick actions

### 21. Posts Content / Posts List
- **File**: `src/components/PostsContent.jsx`
- **Status**: WORKING
- **Description**: Posts list view (drafts, scheduled, history, failed)

### 22. Schedule Content
- **File**: `src/components/ScheduleContent.jsx`
- **Status**: WORKING
- **Description**: Calendar view for scheduled posts

### 23. Settings Content
- **File**: `src/components/SettingsContent.jsx`
- **Status**: WORKING
- **Description**: User and workspace settings

### 24. Top Header / Navigation
- **File**: `src/components/layout/TopHeader.jsx`
- **File**: `src/components/layout/ClientHeader.jsx`
- **Status**: WORKING
- **Description**: Header navigation with workspace switcher

### 25. Right Side Nav
- **File**: `src/components/RightSideNav.jsx`
- **Status**: WORKING
- **Description**: Right sidebar with connected accounts

### 26. Engagement Content
- **File**: `src/components/EngagementContent.jsx`
- **Status**: WORKING
- **Description**: Social media engagement/analytics

### 27. Social Inbox
- **File**: `src/components/SocialInboxContent.jsx`
- **Status**: WORKING
- **Description**: Unified inbox for social messages

### 28. Agency Team Management
- **File**: `src/components/AgencyTeamContent.jsx`
- **File**: `api/agency-team/*.js`
- **Status**: WORKING
- **Description**: Agency-level team roster management

### 29. Approvals Page
- **File**: `src/components/ApprovalsContent.jsx`
- **Status**: WORKING
- **Description**: Post approval queue for workspace owners

### 30. Subscription Components
- **File**: `src/components/subscription/SubscriptionGuard.jsx`
- **File**: `src/components/subscription/FeatureGate.jsx`
- **Status**: WORKING
- **Description**: Subscription tier gating UI components

### 31. Onboarding Flow
- **File**: `src/components/onboarding/*.jsx`
- **Status**: WORKING
- **Description**: New user onboarding wizard

### 32. Pricing Page
- **File**: `src/components/PricingContent.jsx`
- **Status**: WORKING
- **Description**: Subscription pricing display

### 33. useQueries Hook (All Functions)
- **File**: `src/hooks/useQueries.js`
- **Status**: WORKING
- **Description**: All React Query hooks for data fetching

### 34. Supabase Client
- **File**: `src/utils/supabaseClient.js`
- **Status**: WORKING
- **Description**: Supabase client initialization

### 35. API Utils
- **File**: `api/_utils.js`
- **Status**: WORKING
- **Description**: Shared API utilities and helpers

---

## Rules

1. **DO NOT** modify any code in locked features without explicit request
2. **DO NOT** "improve" or refactor locked code
3. **DO NOT** touch related files that might affect locked features
4. **ALWAYS** ask before making changes that could impact these features
5. **READ THIS FILE** before making any changes to the codebase

---

*Last updated: January 22, 2026*
