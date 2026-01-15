# Access Control Implementation Guide

## Woozy Social - Subscription Tiers & Team Roles

This document provides a complete overview of the subscription tier and team role access control system implemented in Woozy Social.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Phase 1: Subscription Tier Enforcement](#phase-1-subscription-tier-enforcement)
3. [Phase 2: Team Role Enforcement](#phase-2-team-role-enforcement)
4. [Usage Examples](#usage-examples)
5. [Testing Guide](#testing-guide)
6. [API Integration](#api-integration)

---

## Overview

The access control system has two layers:

1. **Subscription Tiers** - Control feature access based on the workspace owner's paid plan
2. **Team Roles** - Control permissions based on individual user roles within a workspace

### Hierarchy of Access Control

```
User Access = Subscription Tier (workspace-level) + Team Role (user-level)
```

Example: An **Editor** in a **Solo tier** workspace:
- ❌ Cannot access AI features (blocked by Solo tier)
- ❌ Cannot invite team members (Solo tier has no team management)
- ✅ Can create posts (Editor role allows)

---

## Phase 1: Subscription Tier Enforcement

### Subscription Tiers

| Tier | Price | Workspaces | Team Members | AI Features | Approvals |
|------|-------|-----------|--------------|-------------|-----------|
| **Free** | €0 | 0 (blocked) | 0 | ❌ | ❌ |
| **Solo** | €19 | 1 | 1 (owner only) | ❌ | ❌ |
| **Pro** | €49 | 1 | 3 max | ✅ | ❌ |
| **Pro Plus** | €99 | 4 base + add-ons | Unlimited | ✅ | ✅ |
| **Agency** | €299 | **Unlimited** | Unlimited | ✅ | ✅ |

### Tab Visibility by Tier

**Free Tier:**
- Pricing, Settings only

**Solo Tier:**
- Dashboard, Compose, Schedule, Posts, Engagement, Social Inbox, Settings

**Pro Tier:**
- \+ Brand Profile, Team

**Pro Plus & Agency:**
- \+ Approvals

### Files Created/Modified (Phase 1)

#### Created:
- `src/utils/constants.js` - Tier configurations
- `src/components/subscription/FeatureGate.jsx` - Feature access control
- `src/components/subscription/WorkspaceLimitGate.jsx` - Workspace creation limits
- `src/components/subscription/TeamMemberLimitGate.jsx` - Team invitation limits
- `src/components/subscription/UpgradeModal.jsx` - Upgrade prompts
- `src/components/subscription/index.js` - Subscription components export

#### Modified:
- `src/contexts/AuthContext.jsx` - Added subscription helpers
- `src/components/layout/Sidebar.jsx` - Tier-based tab visibility
- `src/components/ComposeContent.jsx` - Gated AI features
- `src/components/workspace/WorkspaceSwitcher.jsx` - Gated workspace creation
- `src/components/TeamContent.jsx` - Gated team invitations

---

## Phase 2: Team Role Enforcement

### Team Roles & Permissions

| Role | Manage Team | Manage Settings | Create Posts | Edit All Posts | Delete All Posts | Approve Posts |
|------|------------|-----------------|--------------|----------------|------------------|---------------|
| **Owner** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Editor** | ❌ | ❌ | ✅ | Own only | Own only | ❌ |
| **Client** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **View Only** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Role-Specific Portals

**Admin/Editor Portal:** `/dashboard`, `/compose`, `/team`, etc.
**Client Portal:** `/client/dashboard`, `/client/approvals`, `/client/approved`, `/client/calendar`

### Files Created/Modified (Phase 2)

#### Created:
- `src/utils/constants.js` - Role configurations & permission helpers
- `src/components/roles/RoleGuard.jsx` - Role-based UI restrictions
- `src/components/roles/PermissionButton.jsx` - Permission-checked buttons
- `src/components/roles/RoleBadge.jsx` - Visual role indicators
- `src/components/roles/index.js` - Role components export

#### Modified:
- `src/contexts/WorkspaceContext.jsx` - Enhanced with role permission checks
- `src/components/TeamContent.jsx` - Restricted editor actions
- `src/pages/Approvals.jsx` - Gated approve/reject buttons

---

## Usage Examples

### 1. Check Subscription Feature Access

```javascript
import { useAuth } from '../contexts/AuthContext';

const MyComponent = () => {
  const { hasFeatureAccess, subscriptionTier } = useAuth();

  if (hasFeatureAccess('aiFeatures')) {
    return <AIGenerateButton />;
  }

  return <UpgradePrompt requiredTier="Pro" />;
};
```

### 2. Gate a Feature with FeatureGate

```jsx
import { FeatureGate } from '../components/subscription';

<FeatureGate
  feature="aiFeatures"
  fallbackType="overlay"
  requiredTier="Pro"
>
  <AIFeaturePanel />
</FeatureGate>
```

**Fallback Types:**
- `hide` - Completely hide the feature
- `overlay` - Show blurred content with upgrade prompt
- `banner` - Show dismissible upgrade banner

### 3. Check Workspace Creation Limit

```javascript
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';

const { canCreateNewWorkspace, workspaceLimit } = useAuth();
const { userWorkspaces } = useWorkspace();

if (canCreateNewWorkspace(userWorkspaces.length)) {
  // Allow workspace creation
} else {
  // Show upgrade modal
}
```

### 4. Gate Workspace Creation

```jsx
import { WorkspaceLimitGate } from '../components/subscription';

<WorkspaceLimitGate onAllowed={handleCreateWorkspace}>
  <button>Create Workspace</button>
</WorkspaceLimitGate>
```

### 5. Check Role Permissions

```javascript
import { useWorkspace } from '../contexts/WorkspaceContext';

const { hasRolePermission, userRole, canEditPost, canDeletePost } = useWorkspace();

// Check specific permission
if (hasRolePermission('canManageTeam')) {
  return <InviteMemberButton />;
}

// Check post-specific permission
if (canDeletePost(post.created_by)) {
  return <DeleteButton />;
}
```

### 6. Gate UI with RoleGuard

```jsx
import { RoleGuard } from '../components/roles';

<RoleGuard
  permission="canManageTeam"
  fallbackType="hide"
>
  <InviteMemberButton />
</RoleGuard>
```

**Permission Examples:**
- `canManageTeam`
- `canManageSettings`
- `canApprovePosts`
- `canCreatePosts`
- `canDeletePosts`

### 7. Use PermissionButton

```jsx
import { PermissionButton } from '../components/roles';

<PermissionButton
  permission="canManageTeam"
  onClick={handleInvite}
  deniedMessage="Only admins can invite members"
>
  Invite Member
</PermissionButton>
```

### 8. Display Role Badge

```jsx
import { RoleBadge } from '../components/roles';

<RoleBadge role={member.role} size="sm" />
```

---

## Testing Guide

### Test Subscription Tiers

#### Free Tier
1. Create a non-whitelisted user without subscription
2. Verify redirected to `/pricing` on login
3. Verify sidebar shows only Pricing & Settings
4. Verify cannot access `/compose`, `/dashboard`, etc.

#### Solo Tier
1. Set user's `subscription_tier` = 'solo' in `user_profiles`
2. Verify sidebar shows: Dashboard, Compose, Schedule, Posts, Engagement, Social Inbox, Settings
3. Verify AI features hidden in Compose (no ✨ button, no predictions panel)
4. Verify "Add Business" shows upgrade modal (1 workspace limit)
5. Verify "Add Member" shows upgrade modal (Solo has no team management)

#### Pro Tier
1. Set `subscription_tier` = 'pro'
2. Verify Brand Profile tab visible
3. Verify Team tab visible
4. Verify AI features visible (caption suggestions, predictions)
5. Verify Approvals tab **not** visible
6. Create 3 team members → 4th invite shows upgrade modal
7. Verify "Add Business" still blocked (1 workspace limit)

#### Pro Plus Tier
1. Set `subscription_tier` = 'pro_plus'
2. Verify Approvals tab visible
3. Verify can create up to 4 workspaces
4. 5th workspace shows "Add Workspace Bolt" modal
5. Verify unlimited team member invites

#### Agency Tier
1. Set `subscription_tier` = 'agency'
2. Verify all tabs visible
3. Verify can create unlimited workspaces (no limit prompt)
4. Verify unlimited team invitations

### Test Team Roles

#### Owner
1. Create workspace (user becomes owner)
2. Verify can access all tabs
3. Verify can invite/remove members
4. Verify can change member roles
5. Verify can approve posts
6. Verify can delete any post

#### Admin
1. Invite user with `role` = 'admin'
2. Verify can manage team (invite, remove, change roles)
3. Verify can approve posts
4. Verify can delete any post
5. Verify **cannot** delete workspace (owner only)

#### Editor
1. Invite user with `role` = 'editor'
2. Verify Team tab visible but actions hidden
3. Verify can create posts
4. Verify can edit own posts
5. Verify **cannot** edit others' posts
6. Verify can delete own posts
7. Verify **cannot** delete others' posts
8. Verify **cannot** approve posts (if accessing Approvals page, buttons are hidden/disabled)

#### Client
1. Invite user with `role` = 'client'
2. Verify redirected to `/client/dashboard`
3. Verify client portal tabs only
4. Verify can approve posts in `/client/approvals`
5. Verify **cannot** access main portal (`/dashboard`, `/compose`, etc.)

---

## API Integration

### Backend Enforcement (Required)

The frontend access control is user experience only. **You must enforce permissions on the backend** to prevent API bypass.

### API Endpoint Checks

Every API endpoint should:

1. **Verify workspace membership**
```javascript
const { data: member } = await supabase
  .from('workspace_members')
  .select('role, permissions')
  .eq('workspace_id', workspaceId)
  .eq('user_id', userId)
  .single();

if (!member) {
  return sendError(res, 'Not a workspace member', 'FORBIDDEN');
}
```

2. **Check role permissions**
```javascript
import { hasPermission } from '../utils/constants';

if (!hasPermission(member.role, 'canManageTeam')) {
  return sendError(res, 'Insufficient permissions', 'FORBIDDEN');
}
```

3. **Check subscription tier (for feature access)**
```javascript
import { hasFeature } from '../utils/constants';

const { data: profile } = await supabase
  .from('user_profiles')
  .select('subscription_tier')
  .eq('id', workspaceOwnerId)
  .single();

if (!hasFeature(profile.subscription_tier, 'aiFeatures')) {
  return sendError(res, 'Feature not available in current plan', 'PAYMENT_REQUIRED');
}
```

### Database Columns to Add

Add to `user_profiles` table:
```sql
ALTER TABLE user_profiles
ADD COLUMN workspace_add_ons INTEGER DEFAULT 0;
```

This tracks purchased workspace add-ons for Pro Plus/Agency tiers.

---

## Configuration Constants

All tier and role configurations are centralized in:
**`src/utils/constants.js`**

### Available Helper Functions

**Subscription Tier Helpers:**
- `getTierConfig(tier)` - Get tier configuration
- `hasFeature(tier, featureName)` - Check feature access
- `hasTabAccess(tier, tabName)` - Check tab access
- `canCreateWorkspace(tier, count, addOns)` - Check workspace creation
- `canInviteTeamMember(tier, count)` - Check team invitation

**Team Role Helpers:**
- `getRoleConfig(role)` - Get role configuration
- `hasPermission(role, permissionName)` - Check permission
- `hasRoleTabAccess(role, tabName)` - Check tab access
- `isClientRole(role)` - Check if client role
- `isAdminRole(role)` - Check if admin-level role
- `canPerformPostAction(role, action, isOwnPost)` - Check post action permission

---

## Summary

### Phase 1 Deliverables ✅
- ✅ Subscription tier constants and configuration
- ✅ AuthContext subscription helpers
- ✅ FeatureGate, WorkspaceLimitGate, TeamMemberLimitGate components
- ✅ UpgradeModal component
- ✅ Sidebar tier-based tab visibility
- ✅ Compose AI feature gating
- ✅ Workspace creation restriction
- ✅ Team invitation restriction

### Phase 2 Deliverables ✅
- ✅ Role permission constants and helpers
- ✅ WorkspaceContext role-based permission checks
- ✅ RoleGuard, PermissionButton, RoleBadge components
- ✅ TeamContent editor action restrictions
- ✅ Approvals approve/reject button gating

### Next Steps
1. **Database Migration** - Add `workspace_add_ons` column
2. **Backend API Protection** - Add permission checks to all endpoints
3. **Testing** - Test all tiers and roles thoroughly
4. **Stripe Integration** - Connect subscription tiers to Stripe products
5. **Settings Page** - Add workspace add-on purchase flow

---

## Need Help?

For questions or issues with the access control system, refer to:
- This documentation
- `src/utils/constants.js` - All configurations
- `CRITICAL_FEATURES.md` - Critical features that shouldn't be modified
- Team invitations implementation notes in `TeamContent.jsx`

---

**Last Updated:** January 15, 2026
**Version:** 1.0.0
