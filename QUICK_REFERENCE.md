# Quick Reference Guide - Access Control

## 🎯 When to Use What

### Subscription Tier Checks

**Check if user has feature access:**
```javascript
const { hasFeatureAccess } = useAuth();
if (hasFeatureAccess('aiFeatures')) { /* show feature */ }
```

**Gate a feature with overlay:**
```jsx
<FeatureGate feature="aiFeatures" fallbackType="overlay" requiredTier="Pro">
  <AIComponent />
</FeatureGate>
```

**Hide a feature completely:**
```jsx
<FeatureGate feature="aiFeatures" fallbackType="hide">
  <AIButton />
</FeatureGate>
```

**Gate workspace creation:**
```jsx
<WorkspaceLimitGate onAllowed={handleCreate}>
  <button>Create Workspace</button>
</WorkspaceLimitGate>
```

**Gate team invitations:**
```jsx
<TeamMemberLimitGate onAllowed={handleInvite}>
  <button>Add Member</button>
</TeamMemberLimitGate>
```

---

### Role Permission Checks

**Check if user has permission:**
```javascript
const { hasRolePermission } = useWorkspace();
if (hasRolePermission('canManageTeam')) { /* allow action */ }
```

**Check post-specific permissions:**
```javascript
const { canEditPost, canDeletePost } = useWorkspace();
if (canEditPost(post.created_by)) { /* show edit button */ }
if (canDeletePost(post.created_by)) { /* show delete button */ }
```

**Gate UI based on permission:**
```jsx
<RoleGuard permission="canManageTeam" fallbackType="hide">
  <TeamManagementUI />
</RoleGuard>
```

**Gate UI based on allowed roles:**
```jsx
<RoleGuard allowedRoles={['owner', 'admin']} fallbackType="message">
  <SettingsPanel />
</RoleGuard>
```

**Permission-checked button:**
```jsx
<PermissionButton
  permission="canManageTeam"
  onClick={handleAction}
  deniedMessage="Only admins can do this"
>
  Admin Action
</PermissionButton>
```

**Show role badge:**
```jsx
<RoleBadge role={member.role} size="sm" />
```

---

## 📊 Subscription Tiers Cheat Sheet

| Feature | Free | Solo | Pro | Pro+ | Agency |
|---------|------|------|-----|------|--------|
| Workspaces | 0 | 1 | 1 | 4+ | ∞ |
| Team Members | 0 | 1 | 3 | ∞ | ∞ |
| AI Features | ❌ | ❌ | ✅ | ✅ | ✅ |
| Approvals | ❌ | ❌ | ❌ | ✅ | ✅ |
| Brand Profile | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## 👥 Team Roles Cheat Sheet

| Permission | Owner | Admin | Editor | Client | View Only |
|-----------|-------|-------|--------|--------|-----------|
| Manage Team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage Settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create Posts | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit All Posts | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete All Posts | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve Posts | ✅ | ✅ | ❌ | ✅ | ❌ |
| Delete Workspace | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 🔑 Available Permissions

**Team Management:**
- `canManageTeam` - Invite, remove, change member roles
- `canManageSettings` - Modify workspace settings

**Post Management:**
- `canCreatePosts` - Create new posts
- `canEditOwnPosts` - Edit own posts
- `canEditAllPosts` - Edit any post
- `canDeleteOwnPosts` - Delete own posts
- `canDeleteAllPosts` - Delete any post
- `canApprovePosts` - Approve/reject posts

**Workspace:**
- `canDeleteWorkspace` - Delete workspace (owner only)
- `canTransferOwnership` - Transfer ownership (owner only)

**Features:**
- `canViewAnalytics` - View analytics dashboard
- `canManageConnectedAccounts` - Connect/disconnect social accounts
- `canAccessSocialInbox` - Access social inbox

---

## 🎨 Components Import Map

```javascript
// Subscription components
import {
  FeatureGate,
  WorkspaceLimitGate,
  TeamMemberLimitGate,
  UpgradeModal,
  SubscriptionGuard
} from '../components/subscription';

// Role components
import {
  RoleGuard,
  PermissionButton,
  RoleBadge
} from '../components/roles';

// Constants
import {
  SUBSCRIPTION_TIERS,
  TEAM_ROLES,
  getTierConfig,
  getRoleConfig,
  hasFeature,
  hasPermission
} from '../utils/constants';
```

---

## 🧪 Testing Shortcuts

**Set subscription tier:**
```sql
UPDATE user_profiles
SET subscription_tier = 'pro'
WHERE email = 'user@example.com';
```

**Set team role:**
```sql
UPDATE workspace_members
SET role = 'editor'
WHERE user_id = 'xxx' AND workspace_id = 'yyy';
```

**Whitelist user (bypass all restrictions):**
```sql
UPDATE user_profiles
SET is_whitelisted = true
WHERE email = 'test@example.com';
```

---

## 🚨 Common Mistakes to Avoid

1. **Don't check permissions in render without guards:**
   ```jsx
   // ❌ Bad
   {hasRolePermission('canManageTeam') && <Button />}

   // ✅ Good
   <RoleGuard permission="canManageTeam" fallbackType="hide">
     <Button />
   </RoleGuard>
   ```

2. **Don't forget to check on backend:**
   - Frontend checks are UX only
   - Always validate on API endpoints

3. **Don't mix tier and role checks:**
   ```jsx
   // ❌ Bad - mixing concerns
   {hasFeatureAccess('aiFeatures') && hasRolePermission('canCreatePosts')}

   // ✅ Good - separate layers
   <FeatureGate feature="aiFeatures">
     <RoleGuard permission="canCreatePosts">
       <CreatePostButton />
     </RoleGuard>
   </FeatureGate>
   ```

4. **Don't hardcode tier names:**
   ```javascript
   // ❌ Bad
   if (subscriptionTier === 'pro')

   // ✅ Good
   if (subscriptionTier === SUBSCRIPTION_TIERS.PRO)
   ```

---

## 📞 Quick Fixes

**User can't see a tab:**
- Check `TIER_CONFIG[tier].tabs` includes the tab
- Check `ROLE_CONFIG[role].tabs` includes the tab
- Verify `hasTabAccess()` or `hasRoleTabAccess()` returns true

**Feature is blocked:**
- Check `TIER_CONFIG[tier].features[featureName]` is true
- Verify subscription is active: `subscription_status = 'active'`
- Check if user is whitelisted: `is_whitelisted = true`

**Permission denied:**
- Check `ROLE_CONFIG[role].permissions[permissionName]` is true
- Verify user is member of workspace
- Check workspace membership has correct role

**Upgrade modal shows incorrectly:**
- Verify workspace count vs `workspaceLimit`
- Check `canCreateWorkspace()` logic
- Ensure `workspace_add_ons` is set correctly in database

---

**Quick Reference v1.0** | Last Updated: January 15, 2026
