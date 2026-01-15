// In production, API is at api.woozysocial.com. In development, use localhost:3001
// Runtime detection is more reliable than build-time MODE variable
const isLocalhost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const baseURL = isLocalhost
  ? "http://localhost:3001"
  : "https://api.woozysocial.com";

// ===========================
// SUBSCRIPTION TIERS
// ===========================

export const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  SOLO: 'solo',
  PRO: 'pro',
  PRO_PLUS: 'pro_plus',
  AGENCY: 'agency'
};

// Tier configuration with limits and features
export const TIER_CONFIG = {
  [SUBSCRIPTION_TIERS.FREE]: {
    name: 'Free',
    displayName: 'Free Plan',
    price: 0,
    workspaces: {
      max: 0,
      canCreate: false
    },
    team: {
      maxMembers: 0,
      canInvite: false
    },
    features: {
      canPost: false,
      canConnectSocials: false,
      hasAyrshareKey: false,
      aiFeatures: false,
      captionSuggestions: false,
      bestTimeToPost: false,
      postPredictions: false,
      approvalWorkflows: false,
      brandProfile: false,
      analytics: false,
      socialInbox: false
    },
    tabs: ['pricing', 'settings'] // Very restricted
  },

  [SUBSCRIPTION_TIERS.SOLO]: {
    name: 'Solo',
    displayName: 'Solo Tier',
    price: 19,
    workspaces: {
      max: 1,
      canCreate: true,
      canAddMore: false
    },
    team: {
      maxMembers: 1, // Just the owner
      canInvite: false
    },
    features: {
      canPost: true,
      canConnectSocials: true,
      hasAyrshareKey: true,
      aiFeatures: false,
      captionSuggestions: false,
      bestTimeToPost: false,
      postPredictions: false,
      approvalWorkflows: false,
      brandProfile: false,
      analytics: true,
      socialInbox: true
    },
    tabs: ['dashboard', 'compose', 'schedule', 'posts', 'engagement', 'social-inbox', 'settings']
  },

  [SUBSCRIPTION_TIERS.PRO]: {
    name: 'Pro',
    displayName: 'Pro Tier',
    price: 49,
    workspaces: {
      max: 1,
      canCreate: true,
      canAddMore: false
    },
    team: {
      maxMembers: 3, // Including owner
      canInvite: true
    },
    features: {
      canPost: true,
      canConnectSocials: true,
      hasAyrshareKey: true,
      aiFeatures: true,
      captionSuggestions: true,
      bestTimeToPost: true,
      postPredictions: true,
      approvalWorkflows: false, // LOCKED
      brandProfile: true,
      analytics: true,
      socialInbox: true
    },
    tabs: ['dashboard', 'brand-profile', 'compose', 'schedule', 'posts', 'engagement', 'social-inbox', 'team', 'settings']
  },

  [SUBSCRIPTION_TIERS.PRO_PLUS]: {
    name: 'Pro Plus',
    displayName: 'Pro Plus Tier',
    price: 99,
    workspaces: {
      max: 4, // Base limit, can add more with Bolt add-ons (€25 each)
      canCreate: true,
      canAddMore: true,
      addOnPrice: 25
    },
    team: {
      maxMembers: Infinity, // Unlimited
      canInvite: true
    },
    features: {
      canPost: true,
      canConnectSocials: true,
      hasAyrshareKey: true,
      aiFeatures: true,
      captionSuggestions: true,
      bestTimeToPost: true,
      postPredictions: true,
      approvalWorkflows: true, // UNLOCKED
      brandProfile: true,
      analytics: true,
      socialInbox: true
    },
    tabs: ['dashboard', 'brand-profile', 'compose', 'schedule', 'posts', 'engagement', 'social-inbox', 'team', 'approvals', 'settings']
  },

  [SUBSCRIPTION_TIERS.AGENCY]: {
    name: 'Agency',
    displayName: 'Agency Tier',
    price: 299,
    workspaces: {
      max: Infinity, // UNLIMITED workspaces
      canCreate: true,
      canAddMore: true,
      addOnPrice: 25 // Optional add-ons still available
    },
    team: {
      maxMembers: Infinity, // Unlimited
      canInvite: true
    },
    features: {
      canPost: true,
      canConnectSocials: true,
      hasAyrshareKey: true,
      aiFeatures: true,
      captionSuggestions: true,
      bestTimeToPost: true,
      postPredictions: true,
      approvalWorkflows: true,
      brandProfile: true,
      analytics: true,
      socialInbox: true,
      whiteLabel: true, // Future feature
      prioritySupport: true // Future feature
    },
    tabs: ['dashboard', 'brand-profile', 'compose', 'schedule', 'posts', 'engagement', 'social-inbox', 'team', 'approvals', 'settings']
  }
};

// Helper function to get tier configuration
export const getTierConfig = (tier) => {
  // Handle development/testing tiers - treat as AGENCY (full access)
  if (tier === 'development' || tier === 'testing') {
    return TIER_CONFIG[SUBSCRIPTION_TIERS.AGENCY];
  }

  return TIER_CONFIG[tier] || TIER_CONFIG[SUBSCRIPTION_TIERS.FREE];
};

// Helper function to check if a tier has a specific feature
export const hasFeature = (tier, featureName) => {
  const config = getTierConfig(tier);
  return config.features[featureName] === true;
};

// Helper function to check if a tab is accessible for a tier
export const hasTabAccess = (tier, tabName) => {
  const config = getTierConfig(tier);
  return config.tabs.includes(tabName);
};

// Helper function to get workspace limit for a tier (including add-ons)
export const getWorkspaceLimit = (tier, addOnsCount = 0) => {
  const config = getTierConfig(tier);
  const baseLimit = config.workspaces.max;

  // Infinity means unlimited
  if (baseLimit === Infinity) return Infinity;

  // Add workspace add-ons to base limit
  return baseLimit + addOnsCount;
};

// Helper function to check if user can create more workspaces
export const canCreateWorkspace = (tier, currentWorkspaceCount, addOnsCount = 0) => {
  const config = getTierConfig(tier);

  // Check if tier allows workspace creation at all
  if (!config.workspaces.canCreate) return false;

  // Get total allowed workspaces
  const limit = getWorkspaceLimit(tier, addOnsCount);

  // Unlimited
  if (limit === Infinity) return true;

  // Check against limit
  return currentWorkspaceCount < limit;
};

// Helper function to get team member limit for a tier
export const getTeamMemberLimit = (tier) => {
  const config = getTierConfig(tier);
  return config.team.maxMembers;
};

// Helper function to check if user can invite team members
export const canInviteTeamMember = (tier, currentMemberCount) => {
  const config = getTierConfig(tier);

  // Check if tier allows inviting at all
  if (!config.team.canInvite) return false;

  const limit = config.team.maxMembers;

  // Unlimited
  if (limit === Infinity) return true;

  // Check against limit
  return currentMemberCount < limit;
};

// ===========================
// TEAM MEMBER ROLES
// ===========================

export const TEAM_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  CLIENT: 'client',
  VIEW_ONLY: 'view_only'
};

// Role configuration with permissions
export const ROLE_CONFIG = {
  [TEAM_ROLES.OWNER]: {
    name: 'Owner',
    displayName: 'Owner',
    description: 'Full access to all workspace features',
    permissions: {
      canManageTeam: true,
      canManageSettings: true,
      canDeletePosts: true,
      canApprovePosts: true,
      canCreatePosts: true,
      canEditOwnPosts: true,
      canEditAllPosts: true,
      canDeleteOwnPosts: true,
      canDeleteAllPosts: true,
      canDeleteWorkspace: true,
      canTransferOwnership: true,
      canViewAnalytics: true,
      canManageConnectedAccounts: true,
      canAccessSocialInbox: true
    },
    tabs: ['dashboard', 'brand-profile', 'compose', 'schedule', 'posts', 'engagement', 'social-inbox', 'team', 'approvals', 'settings']
  },

  [TEAM_ROLES.ADMIN]: {
    name: 'Admin',
    displayName: 'Admin',
    description: 'Manage team and settings, full posting access',
    permissions: {
      canManageTeam: true,
      canManageSettings: true,
      canDeletePosts: true,
      canApprovePosts: true,
      canCreatePosts: true,
      canEditOwnPosts: true,
      canEditAllPosts: true,
      canDeleteOwnPosts: true,
      canDeleteAllPosts: true,
      canDeleteWorkspace: false, // Only owner can delete workspace
      canTransferOwnership: false,
      canViewAnalytics: true,
      canManageConnectedAccounts: true,
      canAccessSocialInbox: true
    },
    tabs: ['dashboard', 'brand-profile', 'compose', 'schedule', 'posts', 'engagement', 'social-inbox', 'team', 'approvals', 'settings']
  },

  [TEAM_ROLES.EDITOR]: {
    name: 'Editor',
    displayName: 'Editor',
    description: 'Create and manage own posts',
    permissions: {
      canManageTeam: false,
      canManageSettings: false,
      canDeletePosts: false, // Can only delete own posts
      canApprovePosts: false,
      canCreatePosts: true,
      canEditOwnPosts: true,
      canEditAllPosts: false,
      canDeleteOwnPosts: true,
      canDeleteAllPosts: false,
      canDeleteWorkspace: false,
      canTransferOwnership: false,
      canViewAnalytics: true,
      canManageConnectedAccounts: false,
      canAccessSocialInbox: true
    },
    tabs: ['dashboard', 'compose', 'schedule', 'posts', 'engagement', 'social-inbox', 'team'] // Can view team but not manage
  },

  [TEAM_ROLES.CLIENT]: {
    name: 'Client',
    displayName: 'Client',
    description: 'Approve posts and view content',
    permissions: {
      canManageTeam: false,
      canManageSettings: false,
      canDeletePosts: false,
      canApprovePosts: true, // Primary permission
      canCreatePosts: false,
      canEditOwnPosts: false,
      canEditAllPosts: false,
      canDeleteOwnPosts: false,
      canDeleteAllPosts: false,
      canDeleteWorkspace: false,
      canTransferOwnership: false,
      canViewAnalytics: false,
      canManageConnectedAccounts: false,
      canAccessSocialInbox: false
    },
    tabs: ['client/dashboard', 'client/approvals', 'client/approved', 'client/calendar', 'client/notifications'] // Client portal only
  },

  [TEAM_ROLES.VIEW_ONLY]: {
    name: 'View Only',
    displayName: 'View Only',
    description: 'Read-only access to workspace',
    permissions: {
      canManageTeam: false,
      canManageSettings: false,
      canDeletePosts: false,
      canApprovePosts: false,
      canCreatePosts: false,
      canEditOwnPosts: false,
      canEditAllPosts: false,
      canDeleteOwnPosts: false,
      canDeleteAllPosts: false,
      canDeleteWorkspace: false,
      canTransferOwnership: false,
      canViewAnalytics: true,
      canManageConnectedAccounts: false,
      canAccessSocialInbox: false
    },
    tabs: ['dashboard', 'schedule', 'posts', 'engagement'] // Read-only tabs
  }
};

// Helper function to get role configuration
export const getRoleConfig = (role) => {
  return ROLE_CONFIG[role] || ROLE_CONFIG[TEAM_ROLES.VIEW_ONLY];
};

// Helper function to check if a role has a specific permission
export const hasPermission = (role, permissionName) => {
  const config = getRoleConfig(role);
  return config.permissions[permissionName] === true;
};

// Helper function to check if a role can access a tab
export const hasRoleTabAccess = (role, tabName) => {
  const config = getRoleConfig(role);
  return config.tabs.includes(tabName);
};

// Helper function to check if role is client-only
export const isClientRole = (role) => {
  return role === TEAM_ROLES.CLIENT || role === TEAM_ROLES.VIEW_ONLY;
};

// Helper function to check if role is admin-level
export const isAdminRole = (role) => {
  return role === TEAM_ROLES.OWNER || role === TEAM_ROLES.ADMIN;
};

// Helper function to check if user can perform action on a post
export const canPerformPostAction = (role, action, isOwnPost = false) => {
  const config = getRoleConfig(role);

  switch (action) {
    case 'edit':
      return isOwnPost ? config.permissions.canEditOwnPosts : config.permissions.canEditAllPosts;
    case 'delete':
      return isOwnPost ? config.permissions.canDeleteOwnPosts : config.permissions.canDeleteAllPosts;
    case 'approve':
      return config.permissions.canApprovePosts;
    case 'create':
      return config.permissions.canCreatePosts;
    default:
      return false;
  }
};

export { baseURL };