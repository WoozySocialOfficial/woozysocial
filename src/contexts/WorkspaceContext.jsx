import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../utils/supabaseClient';

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

  // Fetch user's workspaces
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

      // Get all workspaces user is a member of
      const { data: memberships, error: memberError } = await supabase
        .from('workspace_members')
        .select(`
          *,
          workspace:workspaces(*)
        `)
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false });

      if (memberError) throw memberError;

      // Transform the data to include membership info with each workspace
      const workspaces = memberships
        .map(m => ({
          ...m.workspace,
          membership: {
            role: m.role,
            permissions: {
              canManageTeam: m.can_manage_team,
              canManageSettings: m.can_manage_settings,
              canDeletePosts: m.can_delete_posts
            }
          }
        }))
        .filter(w => w.id !== undefined); // Filter out any null workspaces

      setUserWorkspaces(workspaces);

      // Set active workspace
      if (workspaces.length > 0) {
        // Try to use last_workspace_id from user_profiles
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('last_workspace_id')
          .eq('id', user.id)
          .single();

        const lastWorkspace = workspaces.find(w => w.id === profile?.last_workspace_id);
        const workspace = lastWorkspace || workspaces[0];

        setActiveWorkspace(workspace);
        setWorkspaceMembership(workspace.membership);
      } else {
        // User has no workspaces - this shouldn't happen after migration
        // but we'll handle it gracefully
        console.warn('User has no workspaces. Migration may need to be run.');
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

  // Create workspace
  const createWorkspace = useCallback(async (name, slug) => {
    if (!user) return { data: null, error: 'User not authenticated' };

    try {
      // Generate slug if not provided
      const workspaceSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      // Create workspace
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({
          name,
          slug: workspaceSlug,
          plan_type: 'free',
          max_team_members: 1,
          max_posts_per_month: 50,
          max_social_accounts: 3
        })
        .select()
        .single();

      if (workspaceError) throw workspaceError;

      // Add user as owner
      const { error: memberError } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: workspace.id,
          user_id: user.id,
          role: 'owner',
          joined_at: new Date().toISOString(),
          can_manage_team: true,
          can_manage_settings: true,
          can_delete_posts: true
        });

      if (memberError) throw memberError;

      // Refresh workspaces
      await fetchUserWorkspaces();

      return { data: workspace, error: null };
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

  // Invite user to workspace
  const inviteToWorkspace = useCallback(async (workspaceId, email, role = 'member') => {
    if (!user) return { data: null, error: 'User not authenticated' };

    try {
      // Check if user has permission to invite
      const membership = userWorkspaces.find(w => w.id === workspaceId)?.membership;
      if (!membership || !membership.permissions.canManageTeam) {
        return { data: null, error: 'You do not have permission to invite members' };
      }

      // Generate invitation token
      const invitationToken = `${workspaceId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Create invitation
      const { data: invitation, error: invitationError } = await supabase
        .from('workspace_invitations')
        .insert({
          workspace_id: workspaceId,
          email,
          role,
          invited_by: user.id,
          invitation_token: invitationToken,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        })
        .select()
        .single();

      if (invitationError) throw invitationError;

      // TODO: Send invitation email
      console.log('Invitation created:', invitation);
      console.log('TODO: Send invitation email to:', email);

      return { data: invitation, error: null };
    } catch (error) {
      console.error('Error inviting to workspace:', error);
      return { data: null, error: error.message };
    }
  }, [user, userWorkspaces]);

  // Remove member from workspace
  const removeMember = useCallback(async (workspaceId, memberId) => {
    if (!user) return { error: 'User not authenticated' };

    try {
      // Check if user has permission to remove members
      const membership = userWorkspaces.find(w => w.id === workspaceId)?.membership;
      if (!membership || !membership.permissions.canManageTeam) {
        return { error: 'You do not have permission to remove members' };
      }

      // Cannot remove yourself
      if (memberId === user.id) {
        return { error: 'You cannot remove yourself from the workspace' };
      }

      // Remove member
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', memberId);

      if (error) throw error;

      return { error: null };
    } catch (error) {
      console.error('Error removing member:', error);
      return { error: error.message };
    }
  }, [user, userWorkspaces]);

  // Update member role
  const updateMemberRole = useCallback(async (workspaceId, memberId, role, permissions = {}) => {
    if (!user) return { error: 'User not authenticated' };

    try {
      // Check if user has permission to update members
      const membership = userWorkspaces.find(w => w.id === workspaceId)?.membership;
      if (!membership || !membership.permissions.canManageTeam) {
        return { error: 'You do not have permission to update members' };
      }

      // Cannot change your own role
      if (memberId === user.id) {
        return { error: 'You cannot change your own role' };
      }

      // Update member
      const { error } = await supabase
        .from('workspace_members')
        .update({
          role,
          can_manage_team: permissions.canManageTeam !== undefined ? permissions.canManageTeam : false,
          can_manage_settings: permissions.canManageSettings !== undefined ? permissions.canManageSettings : false,
          can_delete_posts: permissions.canDeletePosts !== undefined ? permissions.canDeletePosts : true
        })
        .eq('workspace_id', workspaceId)
        .eq('user_id', memberId);

      if (error) throw error;

      return { error: null };
    } catch (error) {
      console.error('Error updating member role:', error);
      return { error: error.message };
    }
  }, [user, userWorkspaces]);

  // Check if user can perform an action
  const canPerformAction = useCallback((action) => {
    if (!workspaceMembership) return false;

    switch (action) {
      case 'manageTeam':
        return workspaceMembership.permissions.canManageTeam;
      case 'manageSettings':
        return workspaceMembership.permissions.canManageSettings;
      case 'deletePosts':
        return workspaceMembership.permissions.canDeletePosts;
      case 'isOwner':
        return workspaceMembership.role === 'owner';
      case 'isAdmin':
        return workspaceMembership.role === 'owner' || workspaceMembership.role === 'admin';
      default:
        return false;
    }
  }, [workspaceMembership]);

  const value = {
    activeWorkspace,
    userWorkspaces,
    workspaceMembership,
    loading,
    switchWorkspace,
    createWorkspace,
    updateWorkspace,
    inviteToWorkspace,
    removeMember,
    updateMemberRole,
    canPerformAction,
    refreshWorkspaces: fetchUserWorkspaces
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
