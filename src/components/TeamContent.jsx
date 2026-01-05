import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { InviteMemberModal } from "./InviteMemberModal";
import { baseURL } from "../utils/constants";
import "./TeamContent.css";

export const TeamContent = () => {
  const { user } = useAuth();
  const [teamMembers, setTeamMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invitesLoading, setInvitesLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchTeamMembers();
      fetchPendingInvites();
    }
  }, [user]);

  const fetchTeamMembers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${baseURL}/api/team/members?userId=${user.id}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to fetch team members');
      }

      setTeamMembers(payload.data || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingInvites = async () => {
    try {
      setInvitesLoading(true);
      const response = await fetch(`${baseURL}/api/team/pending-invites?userId=${user.id}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to fetch pending invites');
      }

      setPendingInvites(payload.data || []);
    } catch (error) {
      console.error('Error fetching pending invites:', error);
    } finally {
      setInvitesLoading(false);
    }
  };

  const handleAddMember = () => {
    setIsModalOpen(true);
  };

  const handleInvite = async (inviteData) => {
    try {
      // Call the server API to send invitation
      const response = await fetch(`${baseURL}/api/send-team-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteData.email,
          role: inviteData.role,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      console.log('Invitation sent successfully:', data);
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
      const response = await fetch(`${baseURL}/api/team/cancel-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inviteId,
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
      // Call the same endpoint to resend
      const response = await fetch(`${baseURL}/api/send-team-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: invite.email,
          role: invite.role,
          userId: user.id,
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
      const response = await fetch(`${baseURL}/api/team/remove-member`, {
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
      const response = await fetch(`${baseURL}/api/team/update-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberId,
          newRole,
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
          <button className="add-member-button" onClick={handleAddMember}>
            + Add Member
          </button>
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
                    admin: 'Admin',
                    editor: 'Editor',
                    view_only: 'View Only',
                  };
                  return labels[role] || role;
                };

                return (
                  <div key={member.id} className="member-card">
                    <div className="member-info">
                      <div className="member-avatar">{getInitials(member.profile?.email)}</div>
                      <div className="member-details">
                        <h3 className="member-name">
                          {member.profile?.full_name || member.profile?.email || "Unknown user"}
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
                      <select
                        className="role-dropdown"
                        value={member.role}
                        onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                      >
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="view_only">View Only</option>
                      </select>
                      <button
                        className="remove-button"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        Remove
                      </button>
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
    </div>
  );
};
