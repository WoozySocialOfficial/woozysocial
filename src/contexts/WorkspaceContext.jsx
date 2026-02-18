import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../utils/supabaseClient';
import { safeFetch, normalizeApiResponse } from '../utils/api';
import {
  baseURL,
  TEAM_ROLES,
  normalizeRole,
  getRoleConfig,
  hasPermission,
  hasRoleTabAccess,
  isClientRole as checkIsClientRole,
  isAdminRole as checkIsAdminRole,
  canPerformPostAction
} from '../utils/constants';

const WorkspaceContext = createContext({});

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

export const WorkspaceProvider = ({ children }) => {
  const { user } = useAuth();

  // Try to get cached workspace data for instant load
  const cachedData = (() => {
    try {
      const cached = sessionStorage.getItem('woozy_workspace_cache');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  })();

  const [activeWorkspace, setActiveWorkspace] = useState(cachedData?.activeWorkspace || null);
  const [userWorkspaces, setUserWorkspaces] = useState(cachedData?.workspaces || []);
  // If we have cached data, don't block rendering with loading state
  const [loading, setLoading] = useState(!cachedData);
  const [workspaceMembership, setWorkspaceMembership] = useState(cachedData?.membership || null);

  // Ref to track current fetch request and prevent race conditions
  const fetchRequestIdRef = useRef(0);

  // Fetch user's workspaces via API
  const fetchUserWorkspaces = useCallback(async () => {
    if (!user) {
      setUserWorkspaces([]);
      setActiveWorkspace(null);
      setWorkspaceMembership(null);
      sessionStorage.removeItem('woozy_workspace_cache');
      setLoading(false);
      return;
    }

    // Increment request ID to track this specific request
    const requestId = ++fetchRequestIdRef.current;

    try {
      // Only show loading if no cached data
      if (!cachedData) setLoading(true);

      // First, try to get workspaces via API using safeFetch
      const { data: listData, error: listError } = await safeFetch(
        `${baseURL}/api/workspace/list?userId=${user.id}`
      );

      // Check if this request is still current (prevents race conditions)
      if (requestId !== fetchRequestIdRef.current) return;

      if (listError) {
        throw new Error(listError);
      }

      // Handle both old format (listData.workspaces) and new format (listData.data.workspaces)
      const responseData = normalizeApiResponse(listData);
      let workspaces = responseData.workspaces || [];

      // If no workspaces, auto-migrate the user
      if (workspaces.length === 0) {
        const { data: migrateData, error: migrateError } = await safeFetch(
          `${baseURL}/api/workspace/migrate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id })
          }
        );

        // Check if this request is still current
        if (requestId !== fetchRequestIdRef.current) return;

        if (!migrateError && migrateData?.success) {
          const migrateResponse = normalizeApiResponse(migrateData);
          if (migrateResponse.workspace) {
            workspaces = [{
              ...migrateResponse.workspace,
              membership: { role: 'owner' }
            }];
          }
        }
      }

      // Final race condition check before updating state
      if (requestId !== fetchRequestIdRef.current) return;

      setUserWorkspaces(workspaces);

      // Set active workspace
      if (workspaces.length > 0) {
        const lastWorkspace = workspaces.find(w => w.id === responseData.lastWorkspaceId);
        const workspace = lastWorkspace || workspaces[0];
        const membership = workspace.membership || { role: 'owner' };

        setActiveWorkspace(workspace);
        setWorkspaceMembership(membership);

        // Cache for faster next load
        try {
          sessionStorage.setItem('woozy_workspace_cache', JSON.stringify({
            workspaces,
            activeWorkspace: workspace,
            membership
          }));
        } catch { /* ignore storage errors */ }
      } else {
        setActiveWorkspace(null);
        setWorkspaceMembership(null);
        sessionStorage.removeItem('woozy_workspace_cache');
      }
    } catch (error) {
      // Only update state if this is still the current request
      if (requestId !== fetchRequestIdRef.current) return;

      console.error('Error fetching workspaces:', error);
      setUserWorkspaces([]);
      setActiveWorkspace(null);
      setWorkspaceMembership(null);
    } finally {
      // Only update loading if this is still the current request
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [user]);

  // Fetch workspaces when user changes
  useEffect(() => {
    fetchUserWorkspaces();
  }, [fetchUserWorkspaces]);

  // Switch workspace
  const switchWorkspace = useCallback(async (workspaceId) => {
    try {
      const workspace = userWorkspaces.find(w => w.id === workspaceId);
      if (!workspace) {
        console.error('Workspace not found:', workspaceId);
        return { error: 'Workspace not found' };
      }

      // Update state immediately for responsive UI
      setActiveWorkspace(workspace);
      setWorkspaceMembership(workspace.membership);

      // Save preference to database (async, non-blocking)
      if (user) {
        await supabase
          .from('user_profiles')
          .update({ last_workspace_id: workspaceId })
          .eq('id', user.id);
      }

      return { error: null };
    } catch (error) {
      console.error('Error switching workspace:', error);
      return { error: error.message };
    }
  }, [userWorkspaces, user]);

  // Create workspace via API (also creates Ayrshare profile)
  const createWorkspace = useCallback(async (businessName, { onBehalfOfUserId } = {}) => {
    if (!user) return { data: null, error: 'User not authenticated' };

    try {
      const payload = {
        userId: user.id,
        businessName: businessName
      };
      if (onBehalfOfUserId) {
        payload.onBehalfOfUserId = onBehalfOfUserId;
      }

      const { data, error: fetchError } = await safeFetch(
        `${baseURL}/api/workspace/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      if (fetchError || !data?.success) {
        throw new Error(fetchError || data?.error || 'Failed to create workspace');
      }

      // Handle both old format (data.workspace) and new format (data.data.workspace)
      const responseData = normalizeApiResponse(data);

      // Refresh workspaces and switch to the new one
      await fetchUserWorkspaces();

      // Switch to the new workspace
      if (responseData.workspace) {
        const effectiveRole = onBehalfOfUserId ? 'member' : 'owner';
        setActiveWorkspace({
          ...responseData.workspace,
          membership: { role: effectiveRole }
        });
        setWorkspaceMembership({ role: effectiveRole });
      }

      return { data: responseData.workspace, error: null };
    } catch (error) {
      console.error('Error creating workspace:', error);
      return { data: null, error: error.message };
    }
  }, [user, fetchUserWorkspaces]);

  // Update workspace
  const updateWorkspace = useCallback(async (workspaceId, updates) => {
    try {
      const { error } = await supabase
        .from('workspaces')
        .update(updates)
        .eq('id', workspaceId);

      if (error) throw error;

      // Refresh workspaces to get updated data
      await fetchUserWorkspaces();

      return { error: null };
    } catch (error) {
      console.error('Error updating workspace:', error);
      return { error: error.message };
    }
  }, [fetchUserWorkspaces]);

  // Invite user to workspace via API
  const inviteToWorkspace = useCallback(async (workspaceId, email, role = 'member') => {
    if (!user) return { data: null, error: 'User not authenticated' };

    try {
      const { data, error: fetchError } = await safeFetch(
        `${baseURL}/api/workspaces/${workspaceId}/invite`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            role,
            userId: user.id
          })
        }
      );

      if (fetchError || !data?.success) {
        throw new Error(fetchError || data?.error || 'Failed to create invitation');
      }

      return { data: data.invitation, error: null };
    } catch (error) {
      console.error('Error inviting to workspace:', error);
      return { data: null, error: error.message };
    }
  }, [user]);

  // Remove member from workspace via API
  const removeMember = useCallback(async (workspaceId, memberId) => {
    if (!user) return { error: 'User not authenticated' };

    try {
      const { data, error: fetchError } = await safeFetch(
        `${baseURL}/api/workspaces/${workspaceId}/remove-member`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId,
            userId: user.id
          })
        }
      );

      if (fetchError || !data?.success) {
        throw new Error(fetchError || data?.error || 'Failed to remove member');
      }

      return { error: null };
    } catch (error) {
      console.error('Error removing member:', error);
      return { error: error.message };
    }
  }, [user]);

  // Update member role via API
  const updateMemberRole = useCallback(async (workspaceId, memberId, role, permissions = {}) => {
    if (!user) return { error: 'User not authenticated' };

    try {
      const { data, error: fetchError } = await safeFetch(
        `${baseURL}/api/workspaces/${workspaceId}/update-member`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId,
            userId: user.id,
            role,
            permissions
          })
        }
      );

      if (fetchError || !data?.success) {
        throw new Error(fetchError || data?.error || 'Failed to update member');
      }

      return { error: null };
    } catch (error) {
      console.error('Error updating member role:', error);
      return { error: error.message };
    }
  }, [user]);

  // Get current user's role (normalized to 3-role model)
  const rawRole = workspaceMembership?.role || TEAM_ROLES.VIEWER;
  const userRole = normalizeRole(rawRole);
  const roleConfig = getRoleConfig(userRole);

  // DB toggle values from workspace membership
  const canApprove = workspaceMembership
    ? (userRole === TEAM_ROLES.OWNER || workspaceMembership.can_approve_posts === true)
    : false;
  const canManageTeam = workspaceMembership
    ? (userRole === TEAM_ROLES.OWNER || workspaceMembership.can_manage_team === true)
    : false;

  // Check if user has a specific permission (toggle-aware)
  const hasRolePermission = useCallback((permissionName) => {
    if (!workspaceMembership) return false;

    // Toggle-based permissions — check DB columns
    if (permissionName === 'canApprovePosts') return canApprove;
    if (permissionName === 'canManageTeam') return canManageTeam;

    // All other permissions — static role lookup
    return hasPermission(userRole, permissionName);
  }, [userRole, workspaceMembership, canApprove, canManageTeam]);

  // Check if user can access a specific tab (toggle-aware)
  const canAccessTab = useCallback((tabName) => {
    if (!workspaceMembership) return false;

    // Approval-related tabs are dynamic based on can_approve toggle
    if (tabName === 'approvals' || tabName === 'client/approvals' || tabName === 'client/approved') {
      return canApprove;
    }

    return hasRoleTabAccess(userRole, tabName);
  }, [userRole, workspaceMembership, canApprove]);

  // Check if user can perform action on a post
  const canEditPost = useCallback((postCreatorId) => {
    const isOwnPost = postCreatorId === user?.id;
    return canPerformPostAction(userRole, 'edit', isOwnPost);
  }, [userRole, user]);

  const canDeletePost = useCallback((postCreatorId) => {
    const isOwnPost = postCreatorId === user?.id;
    return canPerformPostAction(userRole, 'delete', isOwnPost);
  }, [userRole, user]);

  const canApprovePost = useCallback(() => {
    return canApprove;
  }, [canApprove]);

  const canCreatePost = useCallback(() => {
    return canPerformPostAction(userRole, 'create');
  }, [userRole]);

  // Legacy action checker (for backward compatibility)
  const canPerformAction = useCallback((action) => {
    if (!workspaceMembership) return false;

    switch (action) {
      case 'manageTeam':
        return canManageTeam;
      case 'manageSettings':
        return hasPermission(userRole, 'canManageSettings');
      case 'deletePosts':
        return hasPermission(userRole, 'canDeleteAllPosts');
      case 'isOwner':
        return userRole === TEAM_ROLES.OWNER;
      case 'isAdmin':
        return checkIsAdminRole(userRole);
      default:
        return false;
    }
  }, [userRole, workspaceMembership, canManageTeam]);

  // Check if user is a viewer (client portal) — only when membership data is loaded
  const isClient = workspaceMembership ? checkIsClientRole(userRole) : false;
  const isAdmin = checkIsAdminRole(userRole);
  const isOwner = userRole === TEAM_ROLES.OWNER;

  // Fetch workspace members - LAZY LOADED (only when requested)
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [membersLoaded, setMembersLoaded] = useState(false);

  const fetchWorkspaceMembers = useCallback(async () => {
    if (!activeWorkspace?.id || !user) {
      setWorkspaceMembers([]);
      return;
    }

    try {
      const { data: payload, error: fetchError } = await safeFetch(
        `${baseURL}/api/workspaces/${activeWorkspace.id}/members?userId=${user.id}`
      );

      if (fetchError) {
        throw new Error(fetchError);
      }

      const responseData = normalizeApiResponse(payload);
      setWorkspaceMembers(responseData.members || []);
      setMembersLoaded(true);
    } catch (error) {
      console.error('Error fetching workspace members:', error);
      setWorkspaceMembers([]);
    }
  }, [activeWorkspace, user]);

  // Reset members loaded flag when workspace changes
  useEffect(() => {
    setMembersLoaded(false);
    setWorkspaceMembers([]);
  }, [activeWorkspace?.id]);

  const value = {
    // Workspace state
    activeWorkspace,
    userWorkspaces,
    workspaceMembership,
    workspaceMembers,
    membersLoaded,
    loading,

    // Role information
    userRole,
    roleConfig,
    isClient,
    isAdmin,
    isOwner,
    isClientRole: isClient, // Legacy alias

    // Toggle-based permissions
    canApprove,
    canManageTeam,

    // Permission checks
    hasRolePermission,
    canAccessTab,
    canEditPost,
    canDeletePost,
    canApprovePost,
    canCreatePost,
    canPerformAction, // Legacy

    // Workspace operations
    switchWorkspace,
    createWorkspace,
    updateWorkspace,
    inviteToWorkspace,
    removeMember,
    updateMemberRole,
    refreshWorkspaces: fetchUserWorkspaces,
    refreshMembers: fetchWorkspaceMembers
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
