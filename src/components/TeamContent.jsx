/**
 * ⚠️⚠️⚠️ CRITICAL COMPONENT - DO NOT MODIFY WITHOUT APPROVAL ⚠️⚠️⚠️
 *
 * TeamContent Component - Manages workspace team members and invitations
 *
 * This component is CRITICAL for multi-user collaboration. It was extensively
 * debugged and any changes could break:
 * - Team member invitations
 * - Role management
 * - Permission controls
 * - Workspace membership
 *
 * REQUIRED TESTING before any changes:
 * 1. Create invitation → verify email sent with correct URL
 * 2. Accept invitation → verify member added to workspace
 * 3. Update member role → verify permissions updated
 * 4. Remove member → verify member deleted
 * 5. Leave workspace → verify non-owners can leave
 *
 * See CRITICAL_FEATURES.md for complete documentation.
 *
 * Last Stable: January 13, 2026
 */
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useTeamMembers, usePendingInvites, useInvalidateQueries } from "../hooks/useQueries";
import { InviteMemberModal } from "./InviteMemberModal";
import { InviteClientModal } from "./workspace/InviteClientModal";
import TeamMemberLimitGate from "./subscription/TeamMemberLimitGate";
import RoleGuard from "./roles/RoleGuard";
import { baseURL } from "../utils/constants";
import "./TeamContent.css";

export const TeamContent = () => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { invalidateTeam } = useInvalidateQueries();

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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

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

      // Use new invitations API
      const response = await fetch(`${baseURL}/api/invitations/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          email: inviteData.email,
          role: inviteData.role || 'editor',
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      // Refresh pending invites list
      fetchPendingInvites();
      // The modal will close automatically on success
    } catch (error) {
      console.error('Error in handleInvite:', error);
      // Re-throw the error so the modal can display it
      throw error;
    }
  };

  const handleCancelInvite = async (inviteId) => {
    if (!window.confirm('Are you sure you want to cancel this invitation?')) {
      return;
    }

    try {
      // Use new invitations API
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

      // Refresh pending invites
      fetchPendingInvites();
    } catch (error) {
      console.error('Error canceling invite:', error);
      alert(error.message || 'Failed to cancel invitation');
    }
  };

  const handleResendInvite = async (invite) => {
    try {
      // Use workspace invite endpoint to resend (updates existing invitation and sends new email)
      const response = await fetch(`${baseURL}/api/workspace/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          email: invite.email,
          role: invite.role,
          invitedBy: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend invitation');
      }

      alert('Invitation resent successfully!');
      // Update the invited_at timestamp in the UI
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
      // Refresh team members list
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

      // Refresh team members list to show new role
      fetchTeamMembers();
    } catch (error) {
      console.error('Error updating member role:', error);
      alert(error.message || 'Failed to update member role');
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
      // Redirect to home or refresh to switch workspace
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
            <button className="add-client-button" onClick={() => setIsClientModalOpen(true)}>
              + Invite Client
            </button>
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

                const getRoleLabel = (role) => {
                  const labels = {
                    owner: 'Owner',
                    admin: 'Admin',
                    editor: 'Editor',
                    view_only: 'View Only',
                    client: 'Client',
                  };
                  return labels[role] || role;
                };

                const isOwner = member.role === 'owner';
                const isCurrentUser = member.user_id === user.id;

                return (
                  <div key={member.id} className="member-card">
                    <div className="member-info">
                      <div className={`member-avatar ${isOwner ? 'owner' : ''}`}>{getInitials(member.profile?.email)}</div>
                      <div className="member-details">
                        <h3 className="member-name">
                          {member.profile?.full_name || member.profile?.email || "Unknown user"}
                          {isCurrentUser && !isOwner && <span className="owner-badge" style={{backgroundColor: '#4CAF50'}}>You</span>}
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
                      {isOwner ? (
                        <span className="member-role owner-role">{getRoleLabel(member.role)}</span>
                      ) : isCurrentUser ? (
                        <button
                          className="leave-workspace-button"
                          onClick={handleLeaveWorkspace}
                        >
                          Leave Workspace
                        </button>
                      ) : (
                        <>
                          <RoleGuard permission="canManageTeam" fallbackType="hide">
                            <select
                              className="role-dropdown"
                              value={member.role}
                              onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                            >
                              <option value="admin">Admin</option>
                              <option value="editor">Editor</option>
                              <option value="view_only">View Only</option>
                            </select>
                            <button
                              className="remove-button"
                              onClick={() => handleRemoveMember(member.user_id)}
                            >
                              Remove
                            </button>
                          </RoleGuard>
                          <RoleGuard permission="canManageTeam" fallbackType="message" fallbackMessage="Only admins can manage team members.">
                            <span className="member-role">{getRoleLabel(member.role)}</span>
                          </RoleGuard>
                        </>
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
                const getRoleLabel = (role) => {
                  const labels = {
                    admin: 'Admin',
                    editor: 'Editor',
                    view_only: 'View Only',
                    client: 'Client',
                  };
                  return labels[role] || role;
                };

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
                  date.setDate(date.getDate() + 7); // Add 7 days
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

      <InviteMemberModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onInvite={handleInvite}
        currentUserEmail={user?.email}
      />

      <InviteClientModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onInviteSent={() => {
          fetchPendingInvites();
        }}
      />
    </div>
  );
};
