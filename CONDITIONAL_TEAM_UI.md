# Conditional Team UI Implementation ✅

## Overview
Updated the sidebar to conditionally show the "Team" menu item based on the user's subscription status and workspace membership.

---

## Implementation Details

### Updated File: [Sidebar.jsx](src/components/layout/Sidebar.jsx)

**Changes:**
1. ✅ Import `useAuth` and `useWorkspace` hooks
2. ✅ Added logic to determine if Team should be shown
3. ✅ Filter menu items based on subscription/team status

---

## Logic

### Show Team Menu Item When:

```javascript
const showTeam = hasActiveProfile || userWorkspaces.length > 0;
```

**Conditions:**
- **User has active subscription** (`hasActiveProfile = true`)
  - Whitelisted user with profile key
  - Paid subscriber with profile key

- **OR user is part of a workspace** (`userWorkspaces.length > 0`)
  - Invited team member (even without own subscription)
  - Workspace owner
  - Any role in any workspace

### Hide Team Menu Item When:

- User has NO active subscription
- AND user is NOT part of any workspace
- Essentially: solo, non-subscribed users

---

## User Scenarios

### Scenario 1: Non-Subscriber (No Team)

**User:** `testuser@example.com`
- Not in TEST_ACCOUNT_EMAILS
- No Ayrshare profile key
- Not invited to any workspace

**Sidebar Shows:**
```
Dashboard
Brand Profile
Compose
Schedule
Posts
Approvals
Assets
Engagement
Social Inbox
[Team - HIDDEN]
Settings
```

**Rationale:** User can't invite team members without a subscription, so no need to show Team.

---

### Scenario 2: Active Subscriber (Solo)

**User:** `magebazappleid@gmail.com`
- Whitelisted or paid subscriber
- Has Ayrshare profile key
- Not part of other teams (just own workspace)

**Sidebar Shows:**
```
Dashboard
Brand Profile
Compose
Schedule
Posts
Approvals
Assets
Engagement
Social Inbox
Team ✅
Settings
```

**Rationale:** User has subscription, can invite team members.

---

### Scenario 3: Team Member (No Own Subscription)

**User:** `teammember@example.com`
- No own subscription
- No own Ayrshare profile key
- Invited to owner's workspace

**Sidebar Shows:**
```
Dashboard
Brand Profile
Compose
Schedule
Posts
Approvals
Assets
Engagement
Social Inbox
Team ✅
Settings
```

**Rationale:** User is part of a team, should see Team page to view members, workspace details, etc.

---

### Scenario 4: Subscriber + Team Member

**User:** `premium@example.com`
- Has own subscription
- Member of 2 workspaces (own + invited)

**Sidebar Shows:**
```
Dashboard
Brand Profile
Compose
Schedule
Posts
Approvals
Assets
Engagement
Social Inbox
Team ✅
Settings
```

**Rationale:** User has subscription AND is in teams, definitely shows Team.

---

## Code Structure

### Menu Item Configuration

```javascript
const menuItems = [
  { name: "Dashboard", path: "/dashboard" },
  { name: "Brand Profile", path: "/brand-profile" },
  // ... other items ...
  { name: "Team", path: "/team", requiresSubscriptionOrTeam: true },
  { name: "Settings", path: "/settings" }
];
```

**New Property:** `requiresSubscriptionOrTeam: true`
- Marks items that should be conditionally shown
- Can be extended for other features in the future

### Filtering Logic

```javascript
const visibleMenuItems = menuItems.filter(item => {
  if (item.requiresSubscriptionOrTeam) {
    return showTeam;
  }
  return true;
});
```

**Benefits:**
- Easy to add more conditional items
- Centralized logic
- Clean and maintainable

---

## Testing

### Test 1: Non-Subscriber Without Team

1. Sign up with non-whitelisted email
2. Check sidebar
3. **Expected:** "Team" menu item is HIDDEN

### Test 2: Whitelisted User

1. Sign up with `magebazappleid@gmail.com`
2. Check sidebar
3. **Expected:** "Team" menu item is VISIBLE

### Test 3: Invited Team Member

1. Sign up with any email
2. Accept team invitation
3. Check sidebar
4. **Expected:** "Team" menu item is VISIBLE (even without own subscription)

### Test 4: After Subscribing

1. Start as non-subscriber (Team hidden)
2. Subscribe (add to whitelist or activate profile)
3. Refresh page
4. **Expected:** "Team" menu item appears

---

## Future Extensions

This pattern can be extended for other menu items:

```javascript
const menuItems = [
  {
    name: "Analytics",
    path: "/analytics",
    requiresProTier: true  // Only show for Pro+ subscribers
  },
  {
    name: "API Access",
    path: "/api",
    requiresEnterpriseTier: true  // Only show for Enterprise
  }
];

const visibleMenuItems = menuItems.filter(item => {
  if (item.requiresSubscriptionOrTeam) {
    return showTeam;
  }
  if (item.requiresProTier) {
    return subscriptionTier === 'pro' || subscriptionTier === 'enterprise';
  }
  if (item.requiresEnterpriseTier) {
    return subscriptionTier === 'enterprise';
  }
  return true;
});
```

---

## Benefits

### User Experience:
- ✅ Cleaner sidebar for non-subscribers
- ✅ No confusing "Team" option when you can't use it
- ✅ Automatically appears when you subscribe or join a team
- ✅ Progressive disclosure - only show relevant features

### Development:
- ✅ Easy to extend pattern for other menu items
- ✅ Centralized conditional logic
- ✅ Type-safe with menu item properties
- ✅ No hardcoded indices or conditions in JSX

---

## Related Files

- [Sidebar.jsx](src/components/layout/Sidebar.jsx) - Main implementation
- [AuthContext.jsx](src/contexts/AuthContext.jsx) - Provides `hasActiveProfile`
- [WorkspaceContext.jsx](src/contexts/WorkspaceContext.jsx) - Provides `userWorkspaces`

---

## Status: ✅ Complete

**Team sidebar visibility is now dynamic based on subscription and workspace membership.**

Next steps:
- Test with different user types
- Consider similar patterns for other premium features
- Document team workflows for onboarding
