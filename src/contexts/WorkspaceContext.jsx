import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../utils/supabaseClient';
import {
  baseURL,
  TEAM_ROLES,
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
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [userWorkspaces, setUserWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workspaceMembership, setWorkspaceMembership] = useState(null);

  // Fetch user's workspaces via API
  const fetchUserWorkspaces = useCallback(async () => {
    if (!user) {
      setUserWorkspaces([]);
      setActiveWorkspace(null);
      setWorkspaceMembership(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // First, try to get workspaces via API
      const listRes = await fetch(`${baseURL}/api/workspace/list?userId=${user.id}`);
      const listData = await listRes.json();

      // Handle both old format (listData.workspaces) and new format (listData.data.workspaces)
      const responseData = listData.data || listData;
      let workspaces = responseData.workspaces || [];

      // If no workspaces, auto-migrate the user
      if (workspaces.length === 0) {
        console.log('No workspaces found, migrating user...');
        const migrateRes = await fetch(`${baseURL}/api/workspace/migrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id })
        });
        const migrateData = await migrateRes.json();
        // Handle both old format (migrateData.workspace) and new format (migrateData.data.workspace)
        const migrateResponse = migrateData.data || migrateData;

        if (migrateData.success && migrateResponse.workspace) {
          workspaces = [{
            ...migrateResponse.workspace,
            membership: { role: 'owner' }
          }];
        }
      }

      setUserWorkspaces(workspaces);

      // Set active workspace
      if (workspaces.length > 0) {
        const lastWorkspace = workspaces.find(w => w.id === responseData.lastWorkspaceId);
        const workspace = lastWorkspace || workspaces[0];

        setActiveWorkspace(workspace);
        setWorkspaceMembership(workspace.membership || { role: 'owner' });
      } else {
        setActiveWorkspace(null);
        setWorkspaceMembership(null);
      }
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      setUserWorkspaces([]);
      setActiveWorkspace(null);
      setWorkspaceMembership(null);
    } finally {
      setLoading(false);
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
  const createWorkspace = useCallback(async (businessName) => {
    if (!user) return { data: null, error: 'User not authenticated' };

    try {
      const res = await fetch(`${baseURL}/api/workspace/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          businessName: businessName
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create workspace');
      }

      // Handle both old format (data.workspace) and new format (data.data.workspace)
      const responseData = data.data || data;

      // Refresh workspaces and switch to the new one
      await fetchUserWorkspaces();

      // Switch to the new workspace
      if (responseData.workspace) {
        setActiveWorkspace({
          ...responseData.workspace,
          membership: { role: 'owner' }
        });
        setWorkspaceMembership({ role: 'owner' });
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
      const res = await fetch(`${baseURL}/api/workspaces/${workspaceId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role,
          userId: user.id
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create invitation');
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
      const res = await fetch(`${baseURL}/api/workspaces/${workspaceId}/remove-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          userId: user.id
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove member');
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
      const res = await fetch(`${baseURL}/api/workspaces/${workspaceId}/update-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          userId: user.id,
          role,
          permissions
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update member');
      }

      return { error: null };
    } catch (error) {
      console.error('Error updating member role:', error);
      return { error: error.message };
    }
  }, [user]);

  // Get current user's role
  const userRole = workspaceMembership?.role || TEAM_ROLES.VIEW_ONLY;
  const roleConfig = getRoleConfig(userRole);

  // Check if user has a specific permission
  const hasRolePermission = useCallback((permissionName) => {
    if (!workspaceMembership) return false;
    return hasPermission(userRole, permissionName);
  }, [userRole, workspaceMembership]);

  // Check if user can access a specific tab
  const canAccessTab = useCallback((tabName) => {
    if (!workspaceMembership) return false;
    return hasRoleTabAccess(userRole, tabName);
  }, [userRole, workspaceMembership]);

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
    return canPerformPostAction(userRole, 'approve');
  }, [userRole]);

  const canCreatePost = useCallback(() => {
    return canPerformPostAction(userRole, 'create');
  }, [userRole]);

  // Legacy action checker (for backward compatibility)
  const canPerformAction = useCallback((action) => {
    if (!workspaceMembership) return false;

    switch (action) {
      case 'manageTeam':
        return hasPermission(userRole, 'canManageTeam');
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
  }, [userRole, workspaceMembership]);

  // Check if user is a client (view_only/client role) - used for routing to client portal
  const isClient = checkIsClientRole(userRole);
  const isAdmin = checkIsAdminRole(userRole);
  const isOwner = userRole === TEAM_ROLES.OWNER;

  // Fetch workspace members for the active workspace
  const [workspaceMembers, setWorkspaceMembers] = useState([]);

  const fetchWorkspaceMembers = useCallback(async () => {
    if (!activeWorkspace?.id || !user) {
      setWorkspaceMembers([]);
      return;
    }

    try {
      const response = await fetch(`${baseURL}/api/workspaces/${activeWorkspace.id}/members?userId=${user.id}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to fetch members');
      }

      const responseData = payload.data || payload;
      setWorkspaceMembers(responseData.members || []);
    } catch (error) {
      console.error('Error fetching workspace members:', error);
      setWorkspaceMembers([]);
    }
  }, [activeWorkspace, user]);

  // Fetch members when workspace changes
  useEffect(() => {
    fetchWorkspaceMembers();
  }, [fetchWorkspaceMembers]);

  const value = {
    // Workspace state
    activeWorkspace,
    userWorkspaces,
    workspaceMembership,
    workspaceMembers,
    loading,

    // Role information
    userRole,
    roleConfig,
    isClient,
    isAdmin,
    isOwner,
    isClientRole: isClient, // Legacy alias

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
