/**
 * Access Control Utilities for API Endpoints
 *
 * This file contains subscription tier and role permission configurations
 * and helper functions for backend API protection.
 *
 * IMPORTANT: Keep this in sync with src/utils/constants.js
 */

// ===========================
// SUBSCRIPTION TIERS
// ===========================

const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  SOLO: 'solo',
  PRO: 'pro',
  PRO_PLUS: 'pro_plus',
  AGENCY: 'agency'
};

const TIER_CONFIG = {
  free: {
    workspaces: { max: 0 },
    team: { maxMembers: 0 },
    features: {
      canPost: false,
      aiFeatures: false,
      approvalWorkflows: false
    }
  },
  solo: {
    workspaces: { max: 1 },
    team: { maxMembers: 1 },
    features: {
      canPost: true,
      aiFeatures: false,
      approvalWorkflows: false
    }
  },
  pro: {
    workspaces: { max: 1 },
    team: { maxMembers: 3 },
    features: {
      canPost: true,
      aiFeatures: true,
      approvalWorkflows: false
    }
  },
  pro_plus: {
    workspaces: { max: 4 },
    team: { maxMembers: Infinity },
    features: {
      canPost: true,
      aiFeatures: true,
      approvalWorkflows: true
    }
  },
  agency: {
    workspaces: { max: Infinity },
    team: { maxMembers: Infinity },
    features: {
      canPost: true,
      aiFeatures: true,
      approvalWorkflows: true
    }
  },
  // Handle development/testing tiers
  development: {
    workspaces: { max: Infinity },
    team: { maxMembers: Infinity },
    features: {
      canPost: true,
      aiFeatures: true,
      approvalWorkflows: true
    }
  }
};

// ===========================
// TEAM ROLES
// ===========================

const TEAM_ROLES = {
  OWNER: 'owner',
  MEMBER: 'member',
  VIEWER: 'viewer'
};

// Maps legacy 5-role values to new 3-role model
const LEGACY_ROLE_MAP = {
  admin: 'member',
  editor: 'member',
  client: 'viewer',
  view_only: 'viewer'
};

function normalizeRole(role) {
  if (!role) return 'viewer';
  return LEGACY_ROLE_MAP[role] || role;
}

const ROLE_PERMISSIONS = {
  owner: {
    canManageTeam: true,
    canManageSettings: true,
    canDeletePosts: true,
    canApprovePosts: true,
    canCreatePosts: true,
    canEditAllPosts: true,
    canDeleteAllPosts: true,
    canDeleteWorkspace: true
  },
  member: {
    canManageTeam: false,
    canManageSettings: false,
    canDeletePosts: false,
    canApprovePosts: false,
    canCreatePosts: true,
    canEditAllPosts: false,
    canDeleteAllPosts: false,
    canDeleteWorkspace: false
  },
  viewer: {
    canManageTeam: false,
    canManageSettings: false,
    canDeletePosts: false,
    canApprovePosts: false,
    canCreatePosts: false,
    canEditAllPosts: false,
    canDeleteAllPosts: false,
    canDeleteWorkspace: false
  }
};

// ===========================
// HELPER FUNCTIONS
// ===========================

/**
 * Check if a role has a specific permission
 */
function hasPermission(role, permissionName) {
  if (!role) return false;
  const normalized = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalized] || ROLE_PERMISSIONS.viewer;
  return permissions[permissionName] === true;
}

/**
 * Check if a tier has a specific feature
 */
function hasFeature(tier, featureName) {
  if (!tier) return false;
  const config = TIER_CONFIG[tier] || TIER_CONFIG.free;
  return config.features?.[featureName] === true;
}

/**
 * Check if user can create more workspaces
 */
function canCreateWorkspace(tier, currentCount, addOns = 0) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.free;
  const limit = config.workspaces.max + addOns;

  if (limit === Infinity) return true;
  return currentCount < limit;
}

/**
 * Check if user can invite more team members
 */
function canInviteTeamMember(tier, currentCount) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.free;
  const limit = config.team.maxMembers;

  if (limit === Infinity) return true;
  return currentCount < limit;
}

/**
 * Check if user can perform action on a post
 */
function canPerformPostAction(role, action, isOwnPost = false) {
  const normalized = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalized] || ROLE_PERMISSIONS.viewer;

  switch (action) {
    case 'edit':
      return isOwnPost || permissions.canEditAllPosts;
    case 'delete':
      return isOwnPost || permissions.canDeleteAllPosts;
    case 'approve':
      return permissions.canApprovePosts;
    case 'create':
      return permissions.canCreatePosts;
    default:
      return false;
  }
}

/**
 * Verify workspace membership and return member data
 * Returns { success: true, member: {...} } or { success: false, error: '...' }
 */
async function verifyWorkspaceMembership(supabase, userId, workspaceId) {
  try {
    console.log('[ACCESS] Verifying workspace membership:', { userId, workspaceId });

    const { data: member, error } = await supabase
      .from('workspace_members')
      .select('id, user_id, workspace_id, role, can_manage_team, can_manage_settings, can_delete_posts, can_approve_posts')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (error) {
      // PGRST116 = "The result contains 0 rows" - this means user is not a member
      if (error.code === 'PGRST116') {
        console.log('[ACCESS] User is not a member of workspace:', { userId, workspaceId });
        return { success: false, error: 'Not a workspace member', code: 'NOT_MEMBER' };
      }

      // Any other error is a database/RLS issue, not a membership issue
      console.error('[ACCESS] Database error checking membership:', {
        userId,
        workspaceId,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint
      });

      return {
        success: false,
        error: `Database error: ${error.message || 'Failed to verify membership'}`,
        code: 'DB_ERROR',
        details: error
      };
    }

    if (!member) {
      console.log('[ACCESS] No member data returned (should not happen with .single())');
      return { success: false, error: 'Not a workspace member', code: 'NOT_MEMBER' };
    }

    console.log('[ACCESS] Membership verified successfully:', {
      userId,
      workspaceId,
      role: member.role
    });

    return { success: true, member };
  } catch (err) {
    console.error('[ACCESS] Exception verifying workspace membership:', {
      userId,
      workspaceId,
      error: err,
      stack: err.stack
    });
    return { success: false, error: 'Failed to verify membership', code: 'VERIFICATION_ERROR' };
  }
}

/**
 * Check if user has required permission
 * Returns { success: true } or { success: false, error: '...' }
 */
function checkPermission(member, permissionName) {
  if (!member || !member.role) {
    return { success: false, error: 'Invalid member data', code: 'INVALID_MEMBER' };
  }

  let allowed = false;
  const role = normalizeRole(member.role);

  // For toggle-based permissions, check DB columns directly
  if (permissionName === 'canApprovePosts') {
    allowed = role === 'owner' || member.can_approve_posts === true;
  } else if (permissionName === 'canManageTeam') {
    allowed = role === 'owner' || member.can_manage_team === true;
  } else {
    allowed = hasPermission(role, permissionName);
  }

  if (!allowed) {
    return {
      success: false,
      error: `Insufficient permissions. ${permissionName} required.`,
      code: 'INSUFFICIENT_PERMISSIONS'
    };
  }

  return { success: true };
}

/**
 * Send error response with consistent format
 */
function sendError(res, message, code = 'ERROR', statusCode = 400) {
  const errorCodes = {
    'NOT_MEMBER': 403,
    'INSUFFICIENT_PERMISSIONS': 403,
    'FORBIDDEN': 403,
    'UNAUTHORIZED': 401,
    'NOT_FOUND': 404,
    'BAD_REQUEST': 400,
    'PAYMENT_REQUIRED': 402,
    'ERROR': 500
  };

  const status = errorCodes[code] || statusCode;

  return res.status(status).json({
    success: false,
    error: message,
    code: code
  });
}

/**
 * Send success response with consistent format
 */
function sendSuccess(res, data = {}, message = null) {
  return res.status(200).json({
    success: true,
    data: data,
    message: message
  });
}

/**
 * Resolve agency access for a user.
 * Returns whether the user is the agency owner or a delegated manager,
 * and the agency owner's ID to use for all operations.
 *
 * @returns {{ isOwner: boolean, isManager: boolean, agencyOwnerId: string|null, hasAccess: boolean }}
 */
async function getAgencyAccess(supabase, userId) {
  // Path 1: Check if user is an agency owner
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('subscription_tier, subscription_status, is_whitelisted')
    .eq('id', userId)
    .single();

  if (userProfile) {
    const isAgency = userProfile.subscription_tier === SUBSCRIPTION_TIERS.AGENCY;
    const isActive = userProfile.subscription_status === 'active' || userProfile.is_whitelisted;

    if ((isAgency || userProfile.is_whitelisted) && isActive) {
      return {
        isOwner: true,
        isManager: false,
        agencyOwnerId: userId,
        hasAccess: true
      };
    }
  }

  // Path 2: Check if user is a delegated manager in someone else's agency
  const { data: managerEntry } = await supabase
    .from('agency_team_members')
    .select('agency_owner_id')
    .eq('member_user_id', userId)
    .eq('can_manage_agency', true)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (managerEntry) {
    return {
      isOwner: false,
      isManager: true,
      agencyOwnerId: managerEntry.agency_owner_id,
      hasAccess: true
    };
  }

  // No agency access
  return {
    isOwner: false,
    isManager: false,
    agencyOwnerId: null,
    hasAccess: false
  };
}

// ===========================
// EXPORTS (CommonJS)
// ===========================

module.exports = {
  SUBSCRIPTION_TIERS,
  TIER_CONFIG,
  TEAM_ROLES,
  ROLE_PERMISSIONS,
  LEGACY_ROLE_MAP,
  normalizeRole,
  hasPermission,
  hasFeature,
  canCreateWorkspace,
  canInviteTeamMember,
  canPerformPostAction,
  verifyWorkspaceMembership,
  checkPermission,
  getAgencyAccess,
  sendError,
  sendSuccess
};
