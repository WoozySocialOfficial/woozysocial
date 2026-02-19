/**
 * TeamContent Component - Manages workspace team members, invitations, and agency roster
 */
import React, { useState, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useTeamMembers, usePendingInvites, useAgencyAccess, useInvalidateQueries } from "../hooks/useQueries";
import { InviteMemberModal } from "./InviteMemberModal";
import TeamMemberLimitGate from "./subscription/TeamMemberLimitGate";
import RoleGuard from "./roles/RoleGuard";
import { baseURL, normalizeRole } from "../utils/constants";
import "./TeamContent.css";

// Lazy-load AgencyTeamContent (only needed for agency tier)
const AgencyTeamContent = lazy(() =>
  import("./AgencyTeamContent").then(m => ({ default: m.AgencyTeamContent }))
);

const getRoleLabel = (role) => {
  const labels = {
    owner: 'Owner',
    member: 'Member',
    viewer: 'Viewer',
    // Legacy fallbacks
    admin: 'Member',
    editor: 'Member',
    view_only: 'Viewer',
    client: 'Viewer',
  };
  return labels[role] || role;
};

export const TeamContent = () => {
  const { user, subscriptionTier } = useAuth();
  const { activeWorkspace, isOwner, canManageTeam } = useWorkspace();
  const { invalidateTeam } = useInvalidateQueries();
  const queryClient = useQueryClient();

  // Use React Query for cached data fetching
  const {
    data: teamMembers = [],
    isLoading: loading,
    refetch: refetchTeamMembers
  } = useTeamMembers(activeWorkspace?.id, user?.id);

  const {
    data: pendingInvites = [],
    isLoading: invitesLoading,
    refetch: refetchPendingInvites
  } = usePendingInvites(activeWorkspace?.id, user?.id);

  // Check if user has delegated agency management access
  const { data: agencyAccess } = useAgencyAccess(user?.id);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('team'); // 'team' or 'agency'

  // Show Agency Roster tab for agency owners OR delegated managers with can_manage_agency
  const showAgencyTab = (subscriptionTier === 'agency' && (isOwner || canManageTeam))
    || agencyAccess?.isManager;

  // Refresh functions that invalidate cache
  const fetchTeamMembers = () => {
    invalidateTeam(activeWorkspace?.id);
    refetchTeamMembers();
  };

  const fetchPendingInvites = () => {
    invalidateTeam(activeWorkspace?.id);
    refetchPendingInvites();
  };

  const handleAddMember = () => {
    setIsModalOpen(true);
  };

  const handleInvite = async (inviteData) => {
    try {
      if (!activeWorkspace?.id) {
        throw new Error('No active workspace');
      }

      const response = await fetch(`${baseURL}/api/invitations/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          email: inviteData.email,
          role: inviteData.role || 'member',
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      fetchPendingInvites();
    } catch (error) {
      console.error('Error in handleInvite:', error);
      throw error;
    }
  };

  const handleCancelInvite = async (inviteId) => {
    if (!window.confirm('Are you sure you want to cancel this invitation?')) {
      return;
    }

    try {
      const response = await fetch(`${baseURL}/api/invitations/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitationId: inviteId,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel invitation');
      }

      fetchPendingInvites();
    } catch (error) {
      console.error('Error canceling invite:', error);
      alert(error.message || 'Failed to cancel invitation');
    }
  };

  const handleResendInvite = async (invite) => {
    try {
      const response = await fetch(`${baseURL}/api/workspace/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          email: invite.email,
          role: normalizeRole(invite.role),
          invitedBy: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend invitation');
      }

      alert('Invitation resent successfully!');
      fetchPendingInvites();
    } catch (error) {
      console.error('Error resending invite:', error);
      alert(error.message || 'Failed to resend invitation');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Are you sure you want to remove this team member?')) {
      return;
    }

    try {
      const response = await fetch(`${baseURL}/api/workspaces/${activeWorkspace.id}/remove-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberId,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove team member');
      }

      alert('Team member removed successfully!');
      fetchTeamMembers();
    } catch (error) {
      console.error('Error removing team member:', error);
      alert(error.message || 'Failed to remove team member');
    }
  };

  const handleUpdateRole = async (memberId, newRole) => {
    try {
      const response = await fetch(`${baseURL}/api/workspaces/${activeWorkspace.id}/update-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberId,
          role: newRole,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update member role');
      }

      fetchTeamMembers();
    } catch (error) {
      console.error('Error updating member role:', error);
      alert(error.message || 'Failed to update member role');
    }
  };

  const handleTogglePermission = async (memberId, permName, value) => {
    // Map camelCase (API) to snake_case (cache)
    const permMap = {
      canFinalApproval: 'can_final_approval',
      canManageTeam: 'can_manage_team',
      canApprovePosts: 'can_approve_posts',
    };
    const snakePerm = permMap[permName];
    const queryKey = ["teamMembers", activeWorkspace.id];

    // Save previous state for rollback
    const previousData = queryClient.getQueryData(queryKey);

    // Optimistic update — flip the toggle instantly
    if (snakePerm) {
      queryClient.setQueryData(queryKey, (old) =>
        (old || []).map(member =>
          member.user_id === memberId
            ? { ...member, permissions: { ...member.permissions, [snakePerm]: value } }
            : member
        )
      );
    }

    // Fire API call in background
    try {
      const response = await fetch(`${baseURL}/api/workspaces/${activeWorkspace.id}/update-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          userId: user.id,
          permissions: { [permName]: value },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update permission');
      }
    } catch (error) {
      // Revert on failure
      queryClient.setQueryData(queryKey, previousData);
      console.error('Error toggling permission:', error);
      alert(error.message || 'Failed to update permission');
    }
  };

  const handleLeaveWorkspace = async () => {
    if (!window.confirm('Are you sure you want to leave this workspace? You will need to be invited again to rejoin.')) {
      return;
    }

    try {
      const response = await fetch(`${baseURL}/api/invitations/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to leave workspace');
      }

      alert('You have successfully left the workspace');
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Error leaving workspace:', error);
      alert(error.message || 'Failed to leave workspace');
    }
  };

  return (
    <div className="team-container">
      <div className="team-header">
        <h1 className="team-title">Team</h1>
        <p className="team-subtitle">Manage your team members and permissions</p>
      </div>

      {/* Tab bar — only shown for agency tier with appropriate permissions */}
      {showAgencyTab && (
        <div className="team-tab-bar">
          <button
            className={`team-tab ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            Workspace Team
          </button>
          <button
            className={`team-tab ${activeTab === 'agency' ? 'active' : ''}`}
            onClick={() => setActiveTab('agency')}
          >
            Agency Roster
          </button>
        </div>
      )}

      {/* Agency Roster tab */}
      {activeTab === 'agency' && showAgencyTab ? (
        <Suspense fallback={<div className="team-info-box"><p className="info-text">Loading agency roster...</p></div>}>
          <AgencyTeamContent />
        </Suspense>
      ) : (
        <>
          {/* Workspace Team tab */}
          <div className="team-section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Team Members</h2>
                <p className="section-subtitle">Invite and manage your team collaborators</p>
              </div>
              <div className="header-buttons">
                <TeamMemberLimitGate onAllowed={handleAddMember}>
                  <button className="add-member-button">
                    + Add Member
                  </button>
                </TeamMemberLimitGate>
              </div>
            </div>

            <div className="team-content">
              <div className="members-list">
                {loading ? (
                  <div className="team-info-box">
                    <p className="info-text">Loading team members...</p>
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="team-info-box">
                    <p className="info-text">No team members yet</p>
                    <p className="info-subtext">
                      Click "+ Add Member" to invite your first team member
                    </p>
                  </div>
                ) : (
                  teamMembers.map((member) => {
                    const getInitials = (email) => {
                      if (!email) return "NA";
                      return email.substring(0, 2).toUpperCase();
                    };

                    const memberRole = normalizeRole(member.role);
                    const isMemberOwner = memberRole === 'owner';
                    const isCurrentUser = member.user_id === user.id;

                    return (
                      <div key={member.id} className="member-card">
                        <div className="member-info">
                          <div className={`member-avatar ${isMemberOwner ? 'owner' : ''}`}>{getInitials(member.profile?.email)}</div>
                          <div className="member-details">
                            <h3 className="member-name">
                              {member.profile?.full_name || member.profile?.email || "Unknown user"}
                              {isCurrentUser && !isMemberOwner && <span className="owner-badge" style={{backgroundColor: '#4CAF50'}}>You</span>}
                            </h3>
                            <p className="member-email">
                              {member.profile?.email || "Email not available"}
                            </p>
                            <p className="member-email">
                              Joined {new Date(member.joined_at || member.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="member-actions">
                          {isMemberOwner ? (
                            <span className="member-role owner-role">{getRoleLabel(member.role)}</span>
                          ) : isCurrentUser ? (
                            <button
                              className="leave-workspace-button"
                              onClick={handleLeaveWorkspace}
                            >
                              Leave Workspace
                            </button>
                          ) : (
                            <RoleGuard permission="canManageTeam" fallbackType="hide">
                              <div className="member-controls">
                                <select
                                  className="role-dropdown"
                                  value={memberRole}
                                  onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                                >
                                  <option value="member">Member</option>
                                  <option value="viewer">Viewer</option>
                                </select>
                                <div className="permission-toggles">
                                  {/* Member permissions: Final Approval + Manage Team */}
                                  {memberRole === 'member' && (
                                    <>
                                      <label className="toggle-label">
                                        <input
                                          type="checkbox"
                                          checked={member.permissions?.can_final_approval || false}
                                          onChange={(e) => handleTogglePermission(member.user_id, 'canFinalApproval', e.target.checked)}
                                        />
                                        <span className="toggle-switch"></span>
                                        Can final approval
                                      </label>
                                      <label className="toggle-label">
                                        <input
                                          type="checkbox"
                                          checked={member.permissions?.can_manage_team || false}
                                          onChange={(e) => handleTogglePermission(member.user_id, 'canManageTeam', e.target.checked)}
                                        />
                                        <span className="toggle-switch"></span>
                                        Can manage team
                                      </label>
                                    </>
                                  )}

                                  {/* Viewer permissions: Manage Team + Client Approval */}
                                  {memberRole === 'viewer' && (
                                    <>
                                      <label className="toggle-label">
                                        <input
                                          type="checkbox"
                                          checked={member.permissions?.can_approve_posts || false}
                                          onChange={(e) => handleTogglePermission(member.user_id, 'canApprovePosts', e.target.checked)}
                                        />
                                        <span className="toggle-switch"></span>
                                        Can approve posts
                                      </label>
                                      <label className="toggle-label">
                                        <input
                                          type="checkbox"
                                          checked={member.permissions?.can_manage_team || false}
                                          onChange={(e) => handleTogglePermission(member.user_id, 'canManageTeam', e.target.checked)}
                                        />
                                        <span className="toggle-switch"></span>
                                        Can manage team
                                      </label>
                                    </>
                                  )}
                                </div>
                                <button
                                  className="remove-button"
                                  onClick={() => handleRemoveMember(member.user_id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </RoleGuard>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Pending Invitations Section */}
          <div className="team-section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Pending Invitations</h2>
                <p className="section-subtitle">Invitations waiting to be accepted</p>
              </div>
            </div>

            <div className="team-content">
              <div className="members-list">
                {invitesLoading ? (
                  <div className="team-info-box">
                    <p className="info-text">Loading pending invitations...</p>
                  </div>
                ) : pendingInvites.length === 0 ? (
                  <div className="team-info-box">
                    <p className="info-text">No pending invitations</p>
                    <p className="info-subtext">
                      Invitations you send will appear here until they're accepted
                    </p>
                  </div>
                ) : (
                  pendingInvites.map((invite) => {
                    const getInitials = (email) => {
                      return email.substring(0, 2).toUpperCase();
                    };

                    const formatDate = (dateString) => {
                      const date = new Date(dateString);
                      return date.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });
                    };

                    const getExpirationDate = (invitedAt) => {
                      const date = new Date(invitedAt);
                      date.setDate(date.getDate() + 7);
                      return date;
                    };

                    const isExpired = (invitedAt) => {
                      return new Date() > getExpirationDate(invitedAt);
                    };

                    return (
                      <div key={invite.id} className={`member-card ${isExpired(invite.invited_at) ? 'expired' : ''}`}>
                        <div className="member-info">
                          <div className="member-avatar pending">{getInitials(invite.email)}</div>
                          <div className="member-details">
                            <h3 className="member-name">{invite.email}</h3>
                            <div className="invite-meta">
                              <span className="invite-date">Invited {formatDate(invite.invited_at)}</span>
                              <span className="invite-separator">|</span>
                              <span className={`invite-expiry ${isExpired(invite.invited_at) ? 'expired' : ''}`}>
                                {isExpired(invite.invited_at)
                                  ? 'Expired'
                                  : `Expires ${formatDate(getExpirationDate(invite.invited_at))}`
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="member-actions">
                          <span className="member-role pending-badge">{getRoleLabel(invite.role)}</span>
                          <button
                            className="resend-button"
                            onClick={() => handleResendInvite(invite)}
                            title="Resend invitation email"
                          >
                            Resend
                          </button>
                          <button
                            className="cancel-button"
                            onClick={() => handleCancelInvite(invite.id)}
                            title="Cancel invitation"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <InviteMemberModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onInvite={handleInvite}
        currentUserEmail={user?.email}
      />
    </div>
  );
};
