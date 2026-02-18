/**
 * AgencyTeamContent Component - Manages agency-level team roster
 * Visible to agency owners AND delegated managers (can_manage_agency = true)
 */
import React, { useState } from "react";
import { useToast } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { useAgencyAccess, useInvalidateQueries } from "../hooks/useQueries";
import { AddAgencyTeamMemberModal } from "./AddAgencyTeamMemberModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { baseURL, SUBSCRIPTION_TIERS } from "../utils/constants";
import "./AgencyTeamContent.css";

export const AgencyTeamContent = () => {
  const { user, subscriptionTier } = useAuth();
  const { invalidateAgencyTeam } = useInvalidateQueries();
  const toast = useToast();

  // Use the new agency access hook that returns ownership context
  const {
    data: agencyAccess,
    isLoading: loading,
    refetch: refetchTeamMembers
  } = useAgencyAccess(user?.id);

  const teamMembers = agencyAccess?.teamMembers || [];
  const isAgencyOwner = agencyAccess?.isOwner || false;
  const isAgencyManager = agencyAccess?.isManager || false;
  const hasAgencyAccess = agencyAccess?.hasAccess || false;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, memberId: null });

  // Refresh function that invalidates cache
  const refreshTeam = () => {
    invalidateAgencyTeam(user?.id);
    refetchTeamMembers();
  };

  // Check if user has agency access (owner OR delegated manager)
  const isAgencyUser = subscriptionTier === SUBSCRIPTION_TIERS.AGENCY || hasAgencyAccess;

  if (!isAgencyUser && !loading) {
    return (
      <div className="agency-team-container">
        <div className="agency-team-header">
          <h1 className="agency-team-title">Agency Team</h1>
          <p className="agency-team-subtitle">Manage your central team roster</p>
        </div>
        <div className="agency-team-section">
          <div className="team-info-box upgrade-prompt">
            <div className="upgrade-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 className="upgrade-title">Agency Subscription Required</h3>
            <p className="upgrade-text">
              The Agency Team feature allows you to maintain a central team roster and quickly provision members across all your workspaces.
            </p>
            <a href="/pricing" className="upgrade-button">
              Upgrade to Agency
            </a>
          </div>
        </div>
      </div>
    );
  }

  const handleAddMember = () => {
    setEditingMember(null);
    setIsModalOpen(true);
  };

  const handleEditMember = (member) => {
    setEditingMember(member);
    setIsModalOpen(true);
  };

  const handleRemoveClick = (memberId) => {
    setConfirmDialog({ isOpen: true, memberId });
  };

  const handleRemoveMember = async () => {
    const memberId = confirmDialog.memberId;
    if (!memberId) return;

    try {
      const response = await fetch(`${baseURL}/api/agency-team/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          teamMemberId: memberId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove team member');
      }

      toast({
        title: "Team member removed",
        status: "success",
        duration: 3000,
        isClosable: true
      });
      refreshTeam();
    } catch (error) {
      console.error('Error removing team member:', error);
      toast({
        title: "Failed to remove team member",
        description: error.message,
        status: "error",
        duration: 4000,
        isClosable: true
      });
    }
  };

  const handleUpdateRole = async (memberId, newRole) => {
    try {
      const response = await fetch(`${baseURL}/api/agency-team/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          teamMemberId: memberId,
          defaultRole: newRole
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update team member');
      }

      toast({
        title: "Role updated",
        status: "success",
        duration: 2000,
        isClosable: true
      });
      refreshTeam();
    } catch (error) {
      console.error('Error updating team member:', error);
      toast({
        title: "Failed to update role",
        description: error.message,
        status: "error",
        duration: 4000,
        isClosable: true
      });
    }
  };

  const handleToggleCanManageAgency = async (memberId, value) => {
    try {
      const response = await fetch(`${baseURL}/api/agency-team/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          teamMemberId: memberId,
          canManageAgency: value
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update permission');
      }

      toast({
        title: value ? "Agency management enabled" : "Agency management disabled",
        status: "success",
        duration: 2000,
        isClosable: true
      });
      refreshTeam();
    } catch (error) {
      console.error('Error toggling can_manage_agency:', error);
      toast({
        title: "Failed to update permission",
        description: error.message,
        status: "error",
        duration: 4000,
        isClosable: true
      });
    }
  };

  // Filter team members by search query
  const filteredMembers = teamMembers.filter(member => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      member.email.toLowerCase().includes(query) ||
      (member.full_name && member.full_name.toLowerCase().includes(query)) ||
      (member.department && member.department.toLowerCase().includes(query))
    );
  });

  const getInitials = (email, name) => {
    if (name) {
      const parts = name.split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }
    if (!email) return "NA";
    return email.substring(0, 2).toUpperCase();
  };

  const getRoleLabel = (role) => {
    const labels = {
      member: 'Member',
      viewer: 'Viewer',
      // Legacy fallbacks
      admin: 'Member',
      editor: 'Member',
      view_only: 'Viewer',
      client: 'Viewer'
    };
    return labels[role] || role;
  };

  const getStatusBadge = (status, isRegistered) => {
    if (isRegistered) {
      return <span className="status-badge active">Active</span>;
    }
    return <span className="status-badge pending">Pending</span>;
  };

  return (
    <div className="agency-team-container">
      <div className="agency-team-header">
        <h1 className="agency-team-title">Agency Team</h1>
        <p className="agency-team-subtitle">
          {isAgencyManager
            ? "You are managing this agency's team roster on behalf of the agency owner."
            : "Manage your central team roster. Add team members here once, then quickly provision them to any workspace."
          }
        </p>
      </div>

      <div className="agency-team-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Team Roster</h2>
            <p className="section-subtitle">
              {teamMembers.length} team member{teamMembers.length !== 1 ? 's' : ''} in {isAgencyManager ? 'the' : 'your'} roster
            </p>
          </div>
          <button className="add-member-button" onClick={handleAddMember}>
            + Add Team Member
          </button>
        </div>

        {/* Search Bar */}
        {teamMembers.length > 5 && (
          <div className="search-bar">
            <input
              type="text"
              className="search-input"
              placeholder="Search by name, email, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery("")}>
                Clear
              </button>
            )}
          </div>
        )}

        <div className="team-content">
          <div className="members-list">
            {loading ? (
              <div className="team-info-box">
                <p className="info-text">Loading team roster...</p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="team-info-box">
                {searchQuery ? (
                  <>
                    <p className="info-text">No team members found</p>
                    <p className="info-subtext">
                      Try a different search term or clear the search
                    </p>
                  </>
                ) : (
                  <>
                    <p className="info-text">No team members yet</p>
                    <p className="info-subtext">
                      Click "+ Add Team Member" to start building your agency roster
                    </p>
                  </>
                )}
              </div>
            ) : (
              filteredMembers.map((member) => (
                <div key={member.id} className="member-card">
                  <div className="member-info">
                    <div className={`member-avatar ${member.isRegistered ? 'active' : 'pending'}`}>
                      {getInitials(member.email, member.full_name)}
                    </div>
                    <div className="member-details">
                      <h3 className="member-name">
                        {member.full_name || member.email}
                        {getStatusBadge(member.status, member.isRegistered)}
                      </h3>
                      <p className="member-email">{member.email}</p>
                      {member.department && (
                        <p className="member-department">{member.department}</p>
                      )}
                    </div>
                  </div>
                  <div className="member-actions">
                    <select
                      className="role-dropdown"
                      value={member.default_role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                    >
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    {/* Can Manage Agency toggle — only visible to agency owner */}
                    {isAgencyOwner && (
                      <div className="permission-toggles">
                        <label className="toggle-label">
                          <input
                            type="checkbox"
                            checked={member.can_manage_agency || false}
                            onChange={(e) => handleToggleCanManageAgency(member.id, e.target.checked)}
                          />
                          <span className="toggle-switch"></span>
                          Can manage agency
                        </label>
                      </div>
                    )}
                    <button
                      className="edit-button"
                      onClick={() => handleEditMember(member)}
                    >
                      Edit
                    </button>
                    <button
                      className="remove-button"
                      onClick={() => handleRemoveClick(member.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="agency-team-section info-section">
        <h3 className="info-section-title">How it works</h3>
        <div className="info-steps">
          <div className="info-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>Add team members to your roster</h4>
              <p>Add your team members here. They can be existing Woozy Social users or people you plan to invite.</p>
            </div>
          </div>
          <div className="info-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>Create a new workspace</h4>
              <p>When you create a new workspace for a client, you'll be prompted to add team members.</p>
            </div>
          </div>
          <div className="info-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>Provision with one click</h4>
              <p>Select which team members to add and they'll be instantly added or invited to the workspace.</p>
            </div>
          </div>
        </div>
      </div>

      <AddAgencyTeamMemberModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingMember(null);
        }}
        onSuccess={refreshTeam}
        editingMember={editingMember}
        userId={user?.id}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, memberId: null })}
        onConfirm={handleRemoveMember}
        title="Remove Team Member"
        message="Are you sure you want to remove this team member from your roster?"
        confirmText="Remove"
        confirmVariant="danger"
      />
    </div>
  );
};
