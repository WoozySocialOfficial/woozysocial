import { describe, it, expect } from 'vitest'
import {
  SUBSCRIPTION_TIERS,
  TIER_CONFIG,
  getTierConfig,
  hasFeature,
  hasTabAccess,
  getWorkspaceLimit,
  canCreateWorkspace,
  getTeamMemberLimit,
  canInviteTeamMember,
  TEAM_ROLES,
  ROLE_CONFIG,
  getRoleConfig,
  hasPermission,
  hasRoleTabAccess,
  isClientRole,
  isAdminRole,
  canPerformPostAction
} from '../utils/constants.js'

// ===========================
// SUBSCRIPTION TIER TESTS
// ===========================

describe('Subscription Tiers', () => {
  describe('SUBSCRIPTION_TIERS constants', () => {
    it('should have all required tier constants', () => {
      expect(SUBSCRIPTION_TIERS.FREE).toBe('free')
      expect(SUBSCRIPTION_TIERS.SOLO).toBe('solo')
      expect(SUBSCRIPTION_TIERS.PRO).toBe('pro')
      expect(SUBSCRIPTION_TIERS.PRO_PLUS).toBe('pro_plus')
      expect(SUBSCRIPTION_TIERS.AGENCY).toBe('agency')
    })
  })

  describe('TIER_CONFIG', () => {
    it('should have configuration for all tiers', () => {
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.FREE]).toBeDefined()
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.SOLO]).toBeDefined()
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.PRO]).toBeDefined()
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.PRO_PLUS]).toBeDefined()
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.AGENCY]).toBeDefined()
    })

    it('should have correct pricing for each tier', () => {
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.FREE].price).toBe(0)
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.SOLO].price).toBe(19)
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.PRO].price).toBe(49)
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.PRO_PLUS].price).toBe(99)
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.AGENCY].price).toBe(299)
    })

    it('should restrict free tier correctly', () => {
      const free = TIER_CONFIG[SUBSCRIPTION_TIERS.FREE]
      expect(free.workspaces.max).toBe(0)
      expect(free.workspaces.canCreate).toBe(false)
      expect(free.team.maxMembers).toBe(0)
      expect(free.team.canInvite).toBe(false)
      expect(free.features.canPost).toBe(false)
      expect(free.features.canConnectSocials).toBe(false)
    })

    it('should enable posting for Solo tier', () => {
      const solo = TIER_CONFIG[SUBSCRIPTION_TIERS.SOLO]
      expect(solo.features.canPost).toBe(true)
      expect(solo.features.canConnectSocials).toBe(true)
      expect(solo.features.hasAyrshareKey).toBe(true)
    })

    it('should enable AI features for Pro tier', () => {
      const pro = TIER_CONFIG[SUBSCRIPTION_TIERS.PRO]
      expect(pro.features.aiFeatures).toBe(true)
      expect(pro.features.captionSuggestions).toBe(true)
      expect(pro.features.bestTimeToPost).toBe(true)
      expect(pro.features.postPredictions).toBe(true)
    })

    it('should enable approval workflows only for Pro Plus and above', () => {
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.FREE].features.approvalWorkflows).toBe(false)
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.SOLO].features.approvalWorkflows).toBe(false)
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.PRO].features.approvalWorkflows).toBe(false)
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.PRO_PLUS].features.approvalWorkflows).toBe(true)
      expect(TIER_CONFIG[SUBSCRIPTION_TIERS.AGENCY].features.approvalWorkflows).toBe(true)
    })

    it('should grant unlimited workspaces to Agency tier', () => {
      const agency = TIER_CONFIG[SUBSCRIPTION_TIERS.AGENCY]
      expect(agency.workspaces.max).toBe(Infinity)
      expect(agency.team.maxMembers).toBe(Infinity)
    })
  })

  describe('getTierConfig', () => {
    it('should return correct config for valid tiers', () => {
      const soloConfig = getTierConfig('solo')
      expect(soloConfig.name).toBe('Solo')
      expect(soloConfig.price).toBe(19)
    })

    it('should return FREE config for invalid tier', () => {
      const invalidConfig = getTierConfig('invalid_tier')
      expect(invalidConfig.name).toBe('Free')
    })

    it('should treat development tier as Agency', () => {
      const devConfig = getTierConfig('development')
      expect(devConfig.name).toBe('Agency')
    })

    it('should treat testing tier as Agency', () => {
      const testConfig = getTierConfig('testing')
      expect(testConfig.name).toBe('Agency')
    })
  })

  describe('hasFeature', () => {
    it('should correctly check feature access', () => {
      expect(hasFeature('free', 'canPost')).toBe(false)
      expect(hasFeature('solo', 'canPost')).toBe(true)
      expect(hasFeature('pro', 'aiFeatures')).toBe(true)
      expect(hasFeature('solo', 'aiFeatures')).toBe(false)
    })

    it('should return false for non-existent features', () => {
      expect(hasFeature('agency', 'nonExistentFeature')).toBe(false)
    })
  })

  describe('hasTabAccess', () => {
    it('should restrict free tier to minimal tabs', () => {
      expect(hasTabAccess('free', 'pricing')).toBe(true)
      expect(hasTabAccess('free', 'settings')).toBe(true)
      expect(hasTabAccess('free', 'compose')).toBe(false)
      expect(hasTabAccess('free', 'dashboard')).toBe(false)
    })

    it('should allow Solo tier access to core tabs', () => {
      expect(hasTabAccess('solo', 'dashboard')).toBe(true)
      expect(hasTabAccess('solo', 'compose')).toBe(true)
      expect(hasTabAccess('solo', 'schedule')).toBe(true)
      expect(hasTabAccess('solo', 'team')).toBe(false) // No team for Solo
    })

    it('should allow Pro tier access to team', () => {
      expect(hasTabAccess('pro', 'team')).toBe(true)
      expect(hasTabAccess('pro', 'brand-profile')).toBe(true)
      expect(hasTabAccess('pro', 'approvals')).toBe(false) // No approvals for Pro
    })

    it('should allow Pro Plus and Agency access to approvals', () => {
      expect(hasTabAccess('pro_plus', 'approvals')).toBe(true)
      expect(hasTabAccess('agency', 'approvals')).toBe(true)
    })
  })

  describe('getWorkspaceLimit', () => {
    it('should return correct base limits', () => {
      expect(getWorkspaceLimit('free')).toBe(0)
      expect(getWorkspaceLimit('solo')).toBe(1)
      expect(getWorkspaceLimit('pro')).toBe(1)
      expect(getWorkspaceLimit('pro_plus')).toBe(4)
      expect(getWorkspaceLimit('agency')).toBe(Infinity)
    })

    it('should add workspace add-ons to limit', () => {
      expect(getWorkspaceLimit('pro_plus', 2)).toBe(6) // 4 + 2
      expect(getWorkspaceLimit('pro', 3)).toBe(4) // 1 + 3
    })

    it('should handle unlimited (Infinity) correctly', () => {
      expect(getWorkspaceLimit('agency', 10)).toBe(Infinity)
    })
  })

  describe('canCreateWorkspace', () => {
    it('should not allow free tier to create workspaces', () => {
      expect(canCreateWorkspace('free', 0)).toBe(false)
    })

    it('should allow Solo to create one workspace', () => {
      expect(canCreateWorkspace('solo', 0)).toBe(true)
      expect(canCreateWorkspace('solo', 1)).toBe(false)
    })

    it('should allow Pro Plus to create multiple workspaces', () => {
      expect(canCreateWorkspace('pro_plus', 0)).toBe(true)
      expect(canCreateWorkspace('pro_plus', 3)).toBe(true)
      expect(canCreateWorkspace('pro_plus', 4)).toBe(false) // At limit
    })

    it('should always allow Agency to create workspaces', () => {
      expect(canCreateWorkspace('agency', 0)).toBe(true)
      expect(canCreateWorkspace('agency', 100)).toBe(true)
      expect(canCreateWorkspace('agency', 1000)).toBe(true)
    })
  })

  describe('getTeamMemberLimit', () => {
    it('should return correct team limits', () => {
      expect(getTeamMemberLimit('free')).toBe(0)
      expect(getTeamMemberLimit('solo')).toBe(1)
      expect(getTeamMemberLimit('pro')).toBe(3)
      expect(getTeamMemberLimit('pro_plus')).toBe(Infinity)
      expect(getTeamMemberLimit('agency')).toBe(Infinity)
    })
  })

  describe('canInviteTeamMember', () => {
    it('should not allow free tier to invite', () => {
      expect(canInviteTeamMember('free', 0)).toBe(false)
    })

    it('should not allow Solo tier to invite', () => {
      expect(canInviteTeamMember('solo', 0)).toBe(false)
      expect(canInviteTeamMember('solo', 1)).toBe(false)
    })

    it('should allow Pro tier to invite up to limit', () => {
      expect(canInviteTeamMember('pro', 0)).toBe(true)
      expect(canInviteTeamMember('pro', 2)).toBe(true)
      expect(canInviteTeamMember('pro', 3)).toBe(false) // At limit
    })

    it('should always allow Pro Plus and Agency to invite', () => {
      expect(canInviteTeamMember('pro_plus', 100)).toBe(true)
      expect(canInviteTeamMember('agency', 1000)).toBe(true)
    })
  })
})

// ===========================
// TEAM ROLE TESTS
// ===========================

describe('Team Roles', () => {
  describe('TEAM_ROLES constants', () => {
    it('should have all required role constants', () => {
      expect(TEAM_ROLES.OWNER).toBe('owner')
      expect(TEAM_ROLES.MEMBER).toBe('member')
      expect(TEAM_ROLES.VIEWER).toBe('viewer')
    })
  })

  describe('ROLE_CONFIG', () => {
    it('should have configuration for all roles', () => {
      expect(ROLE_CONFIG[TEAM_ROLES.OWNER]).toBeDefined()
      expect(ROLE_CONFIG[TEAM_ROLES.MEMBER]).toBeDefined()
      expect(ROLE_CONFIG[TEAM_ROLES.VIEWER]).toBeDefined()
    })

    it('should grant owner all permissions', () => {
      const owner = ROLE_CONFIG[TEAM_ROLES.OWNER]
      expect(owner.permissions.canManageTeam).toBe(true)
      expect(owner.permissions.canManageSettings).toBe(true)
      expect(owner.permissions.canDeleteWorkspace).toBe(true)
      expect(owner.permissions.canTransferOwnership).toBe(true)
    })

    it('should allow member to create and edit own posts', () => {
      const member = ROLE_CONFIG[TEAM_ROLES.MEMBER]
      expect(member.permissions.canCreatePosts).toBe(true)
      expect(member.permissions.canEditOwnPosts).toBe(true)
      expect(member.permissions.canEditAllPosts).toBe(false)
      expect(member.permissions.canDeleteOwnPosts).toBe(true)
      expect(member.permissions.canDeleteAllPosts).toBe(false)
      expect(member.permissions.canDeleteWorkspace).toBe(false)
      expect(member.permissions.canTransferOwnership).toBe(false)
    })

    it('should have member approve/manage as false by default (DB toggle overrides)', () => {
      const member = ROLE_CONFIG[TEAM_ROLES.MEMBER]
      expect(member.permissions.canApprovePosts).toBe(false)
      expect(member.permissions.canManageTeam).toBe(false)
    })

    it('should restrict viewer to read-only with no base permissions', () => {
      const viewer = ROLE_CONFIG[TEAM_ROLES.VIEWER]
      expect(viewer.permissions.canCreatePosts).toBe(false)
      expect(viewer.permissions.canEditOwnPosts).toBe(false)
      expect(viewer.permissions.canApprovePosts).toBe(false)
      expect(viewer.permissions.canManageTeam).toBe(false)
      expect(viewer.permissions.canViewAnalytics).toBe(false)
      expect(viewer.permissions.canAccessSocialInbox).toBe(false)
    })
  })

  describe('getRoleConfig', () => {
    it('should return correct config for valid roles', () => {
      const memberConfig = getRoleConfig('member')
      expect(memberConfig.name).toBe('Member')
    })

    it('should normalize legacy roles', () => {
      expect(getRoleConfig('admin').name).toBe('Member')
      expect(getRoleConfig('editor').name).toBe('Member')
      expect(getRoleConfig('client').name).toBe('Viewer')
      expect(getRoleConfig('view_only').name).toBe('Viewer')
    })

    it('should return Viewer config for invalid role', () => {
      const invalidConfig = getRoleConfig('invalid_role')
      expect(invalidConfig.name).toBe('Viewer')
    })
  })

  describe('hasPermission', () => {
    it('should correctly check permissions', () => {
      expect(hasPermission('owner', 'canDeleteWorkspace')).toBe(true)
      expect(hasPermission('member', 'canCreatePosts')).toBe(true)
      expect(hasPermission('member', 'canDeleteWorkspace')).toBe(false)
      expect(hasPermission('viewer', 'canCreatePosts')).toBe(false)
    })

    it('should normalize legacy roles when checking permissions', () => {
      // admin/editor → member
      expect(hasPermission('admin', 'canCreatePosts')).toBe(true)
      expect(hasPermission('editor', 'canCreatePosts')).toBe(true)
      // client/view_only → viewer
      expect(hasPermission('client', 'canCreatePosts')).toBe(false)
      expect(hasPermission('view_only', 'canCreatePosts')).toBe(false)
    })
  })

  describe('hasRoleTabAccess', () => {
    it('should allow owner access to all tabs', () => {
      expect(hasRoleTabAccess('owner', 'dashboard')).toBe(true)
      expect(hasRoleTabAccess('owner', 'team')).toBe(true)
      expect(hasRoleTabAccess('owner', 'approvals')).toBe(true)
      expect(hasRoleTabAccess('owner', 'settings')).toBe(true)
    })

    it('should allow member access to core tabs but not settings/approvals', () => {
      expect(hasRoleTabAccess('member', 'dashboard')).toBe(true)
      expect(hasRoleTabAccess('member', 'compose')).toBe(true)
      expect(hasRoleTabAccess('member', 'posts')).toBe(true)
      expect(hasRoleTabAccess('member', 'team')).toBe(true)
      expect(hasRoleTabAccess('member', 'settings')).toBe(false)
      // Approvals tab is added dynamically via DB toggle
      expect(hasRoleTabAccess('member', 'approvals')).toBe(false)
    })

    it('should restrict viewer to client portal tabs', () => {
      expect(hasRoleTabAccess('viewer', 'client/dashboard')).toBe(true)
      expect(hasRoleTabAccess('viewer', 'client/calendar')).toBe(true)
      expect(hasRoleTabAccess('viewer', 'client/assets')).toBe(true)
      expect(hasRoleTabAccess('viewer', 'compose')).toBe(false)
      expect(hasRoleTabAccess('viewer', 'settings')).toBe(false)
    })
  })

  describe('isClientRole', () => {
    it('should identify client roles correctly', () => {
      expect(isClientRole('viewer')).toBe(true)
      // Legacy roles that map to viewer
      expect(isClientRole('client')).toBe(true)
      expect(isClientRole('view_only')).toBe(true)
      // Non-client roles
      expect(isClientRole('member')).toBe(false)
      expect(isClientRole('owner')).toBe(false)
    })
  })

  describe('isAdminRole', () => {
    it('should identify admin roles correctly', () => {
      expect(isAdminRole('owner')).toBe(true)
      // Legacy admin maps to member, not owner
      expect(isAdminRole('admin')).toBe(false)
      expect(isAdminRole('member')).toBe(false)
      expect(isAdminRole('viewer')).toBe(false)
    })
  })

  describe('canPerformPostAction', () => {
    it('should allow owner to perform all actions', () => {
      expect(canPerformPostAction('owner', 'edit', true)).toBe(true)
      expect(canPerformPostAction('owner', 'edit', false)).toBe(true)
      expect(canPerformPostAction('owner', 'delete', true)).toBe(true)
      expect(canPerformPostAction('owner', 'delete', false)).toBe(true)
      expect(canPerformPostAction('owner', 'approve')).toBe(true)
      expect(canPerformPostAction('owner', 'create')).toBe(true)
    })

    it('should allow member to create and edit/delete own posts', () => {
      expect(canPerformPostAction('member', 'create')).toBe(true)
      expect(canPerformPostAction('member', 'edit', true)).toBe(true)
      expect(canPerformPostAction('member', 'edit', false)).toBe(false)
      expect(canPerformPostAction('member', 'delete', true)).toBe(true)
      expect(canPerformPostAction('member', 'delete', false)).toBe(false)
      // Approve is false by default (DB toggle overrides at runtime)
      expect(canPerformPostAction('member', 'approve')).toBe(false)
    })

    it('should not allow viewer any post actions by default', () => {
      expect(canPerformPostAction('viewer', 'create')).toBe(false)
      expect(canPerformPostAction('viewer', 'edit', true)).toBe(false)
      expect(canPerformPostAction('viewer', 'delete', true)).toBe(false)
      // Approve is false by default (DB toggle overrides at runtime)
      expect(canPerformPostAction('viewer', 'approve')).toBe(false)
    })

    it('should return false for unknown actions', () => {
      expect(canPerformPostAction('owner', 'unknown_action')).toBe(false)
    })
  })
})
