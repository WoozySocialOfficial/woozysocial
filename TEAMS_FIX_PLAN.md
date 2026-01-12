# Teams Section - Implementation Plan

## Current State Summary

### What Works
- Basic team member list display
- Invite modal with role selection
- Workspace invitations via email (Resend)
- Accept invite flow
- Remove member functionality
- Update role functionality

### Critical Issues Found

| Issue | Impact | Priority |
|-------|--------|----------|
| Dual tables (team_* AND workspace_*) | Data inconsistency | HIGH |
| Inconsistent API response format | Frontend confusion | HIGH |
| Permissions not auto-set by role | Security gap | HIGH |
| Notifications not being sent | Users not informed | MEDIUM |
| No audit trail | No accountability | LOW |

---

## Implementation Plan

### Phase 1: Consolidate to Workspace System (HIGH PRIORITY)

**Goal:** Remove dual-system confusion by using ONLY workspace_* tables

#### Step 1.1: Update TeamContent.jsx
- Change API calls from `/api/team/*` to `/api/workspaces/[id]/*`
- Use consistent response handling

#### Step 1.2: Deprecate Legacy Endpoints
Files to update:
- `api/team/members.js` → redirect to workspace endpoint
- `api/team/pending-invites.js` → redirect to workspace endpoint
- `functions/server.js` → remove or redirect legacy routes

#### Step 1.3: Database Migration
- Migrate any data from `team_members` to `workspace_members`
- Migrate any data from `team_invitations` to `workspace_invitations`

---

### Phase 2: Standardize API Responses (HIGH PRIORITY)

**Goal:** All endpoints return `{ success: true, data: {...} }` format

Files to fix:
```
api/workspaces/[workspaceId]/members.js
api/workspaces/[workspaceId]/invitations.js
api/team/members.js
api/team/pending-invites.js
```

Current inconsistency:
```javascript
// Some return:
{ members: [...] }

// Should all return:
{ success: true, data: { members: [...] } }
```

---

### Phase 3: Permission System (HIGH PRIORITY)

**Goal:** Auto-set permissions when user is invited based on role

#### Role Permission Defaults:
```javascript
const ROLE_PERMISSIONS = {
  owner: {
    can_manage_team: true,
    can_manage_settings: true,
    can_delete_posts: true,
    can_approve_posts: true
  },
  admin: {
    can_manage_team: true,
    can_manage_settings: true,
    can_delete_posts: true,
    can_approve_posts: true
  },
  editor: {
    can_manage_team: false,
    can_manage_settings: false,
    can_delete_posts: true,
    can_approve_posts: false
  },
  view_only: {
    can_manage_team: false,
    can_manage_settings: false,
    can_delete_posts: false,
    can_approve_posts: false
  },
  client: {
    can_manage_team: false,
    can_manage_settings: false,
    can_delete_posts: false,
    can_approve_posts: true  // Clients CAN approve
  }
};
```

Files to update:
- `api/workspace/accept-invite.js` - Apply permissions on accept
- `api/workspaces/[workspaceId]/update-member.js` - Update permissions on role change

---

### Phase 4: Notifications (MEDIUM PRIORITY)

**Goal:** Users get notified of team events

#### Events to notify:
1. **Invitation sent** - Recipient gets email (already works)
2. **Invitation accepted** - Workspace admins notified (NOT WORKING)
3. **Role changed** - Member notified (NOT WORKING)
4. **Post pending approval** - Approvers notified (PARTIALLY WORKING)
5. **Post approved/rejected** - Creator notified (NOT WORKING)

Files to update:
- `api/workspace/accept-invite.js` - Call `sendMemberJoinedNotification()`
- `api/workspaces/[workspaceId]/update-member.js` - Call `sendRoleChangedNotification()`
- `api/post/approve.js` - Call `sendApprovalNotification()`

---

### Phase 5: Client Approval Workflow (MEDIUM PRIORITY)

**Goal:** Clients can view and approve scheduled posts

#### Current Flow:
1. Owner schedules post → Saved with `status: 'pending_approval'`
2. Client sees pending posts → `/api/post/pending-approvals`
3. Client approves → Post sent to Ayrshare

#### Fixes Needed:
- Ensure `workspaceHasClients()` properly detects client members
- Verify client can access pending approvals endpoint
- Test approve/reject flow end-to-end

---

## File Changes Summary

### Frontend
| File | Change |
|------|--------|
| `src/components/TeamContent.jsx` | Use workspace endpoints |
| `src/components/ScheduleContent.jsx` | Show pending approval badge |
| `src/pages/client/ClientApprovals.jsx` | Verify works with new system |

### Backend (Vercel)
| File | Change |
|------|--------|
| `api/workspaces/[workspaceId]/members.js` | Standardize response |
| `api/workspace/accept-invite.js` | Add permissions + notification |
| `api/post/approve.js` | Add notification |
| `api/post/pending-approvals.js` | Verify client access |

### Backend (Local)
| File | Change |
|------|--------|
| `functions/server.js` | Mirror all changes |

---

## Testing Checklist

### Team Management
- [ ] Owner can invite member with email
- [ ] Member receives email with invite link
- [ ] Member can accept invite and join workspace
- [ ] Member appears in team list with correct role
- [ ] Owner can change member role
- [ ] Member gets notification of role change
- [ ] Owner can remove member
- [ ] Member cannot remove themselves
- [ ] Owner cannot be removed

### Client Approval
- [ ] Client role can be assigned
- [ ] Client sees pending posts for approval
- [ ] Client can approve post → Post goes to Ayrshare
- [ ] Client can reject post → Creator notified
- [ ] Client can request changes → Creator notified
- [ ] Creator sees approval status on their posts

### Notifications
- [ ] Email sent on invite
- [ ] In-app notification on invite accept
- [ ] In-app notification on role change
- [ ] In-app notification on post approval/rejection

---

## Estimated Work

| Phase | Time | Dependencies |
|-------|------|--------------|
| Phase 1: Consolidate | 2-3 hours | None |
| Phase 2: API Response | 1 hour | Phase 1 |
| Phase 3: Permissions | 1-2 hours | Phase 1 |
| Phase 4: Notifications | 2 hours | Phase 1, 3 |
| Phase 5: Client Approval | 1-2 hours | Phase 1, 3 |

**Total: 7-10 hours of focused work**

---

## Start Here

1. First, decide: **Fix locally first or directly on Vercel?**
2. I recommend: Fix locally, test thoroughly, then push

Ready to proceed? Tell me which phase to start with.
