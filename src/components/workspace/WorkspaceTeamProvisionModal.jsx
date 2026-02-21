/**
 * WorkspaceTeamProvisionModal - Provision agency team members to a workspace
 * Shown after workspace creation for agency users
 */
import React, { useState, useMemo } from "react";
import { baseURL } from "../../utils/constants";
import "./WorkspaceTeamProvisionModal.css";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" }
];

// Normalize legacy role values from the agency roster to the current model
const LEGACY_ROLE_MAP = { admin: 'member', editor: 'member', view_only: 'viewer', client: 'viewer' };
const normalizeRole = (role) => LEGACY_ROLE_MAP[role] || role || 'member';

export const WorkspaceTeamProvisionModal = ({
  isOpen,
  onClose,
  workspace,
  teamMembers = [],
  userId
}) => {
  const [selectedMembers, setSelectedMembers] = useState({});
  const [roleOverrides, setRoleOverrides] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);

  // Group members by status
  const groupedMembers = useMemo(() => {
    const active = teamMembers.filter(m => m.isRegistered);
    const pending = teamMembers.filter(m => !m.isRegistered);
    return { active, pending };
  }, [teamMembers]);

  const handleToggleMember = (memberId) => {
    setSelectedMembers(prev => ({
      ...prev,
      [memberId]: !prev[memberId]
    }));
  };

  const handleSelectAll = (members) => {
    const allSelected = members.every(m => selectedMembers[m.id]);
    const updates = {};
    members.forEach(m => {
      updates[m.id] = !allSelected;
    });
    setSelectedMembers(prev => ({ ...prev, ...updates }));
  };

  const handleRoleChange = (memberId, role) => {
    setRoleOverrides(prev => ({
      ...prev,
      [memberId]: role
    }));
  };

  const getSelectedCount = () => {
    return Object.values(selectedMembers).filter(Boolean).length;
  };

  const handleProvision = async () => {
    const selectedIds = Object.entries(selectedMembers)
      .filter(([_, selected]) => selected)
      .map(([id]) => id);

    if (selectedIds.length === 0) {
      setError("Please select at least one team member");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${baseURL}/api/agency-team/bulk-provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          workspaceId: workspace.id,
          teamMemberIds: selectedIds,
          roleOverrides: Object.keys(roleOverrides).length > 0 ? roleOverrides : undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to provision team members');
      }

      setResults(data.data || data);
    } catch (error) {
      setError(error.message || 'Failed to provision team members');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedMembers({});
    setRoleOverrides({});
    setError("");
    setResults(null);
    onClose();
  };

  if (!isOpen) return null;

  // Show results view after provisioning
  if (results) {
    return (
      <div className="provision-modal-overlay" onClick={handleClose}>
        <div className="provision-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="provision-modal-header">
            <h2 className="provision-modal-title">Provisioning Complete</h2>
          </div>

          <div className="provision-results">
            <div className="results-summary">
              {results.summary?.directAdded > 0 && (
                <div className="result-item success">
                  <span className="result-icon">✓</span>
                  <span>{results.summary.directAdded} team member{results.summary.directAdded !== 1 ? 's' : ''} added directly</span>
                </div>
              )}
              {results.summary?.invitationsSent > 0 && (
                <div className="result-item success">
                  <span className="result-icon">✉</span>
                  <span>{results.summary.invitationsSent} invitation{results.summary.invitationsSent !== 1 ? 's' : ''} sent</span>
                </div>
              )}
              {results.summary?.skipped > 0 && (
                <div className="result-item skipped">
                  <span className="result-icon">–</span>
                  <span>{results.summary.skipped} already in workspace (skipped)</span>
                </div>
              )}
              {results.summary?.errors > 0 && (
                <div className="result-item error">
                  <span className="result-icon">✕</span>
                  <span>{results.summary.errors} failed</span>
                </div>
              )}
            </div>

            {results.results && results.results.length > 0 && (
              <div className="results-details">
                <h4>Details</h4>
                <div className="results-list">
                  {results.results.map((r, idx) => (
                    <div key={idx} className={`result-row ${r.status}`}>
                      <span className="result-email">{r.email}</span>
                      <span className={`result-status ${r.status}`}>
                        {r.status === 'added' && 'Added'}
                        {r.status === 'invited' && 'Invited'}
                        {r.status === 'skipped' && 'Skipped'}
                        {r.status === 'error' && r.error}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="provision-modal-actions">
            <button className="provision-done-button" onClick={handleClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="provision-modal-overlay" onClick={handleClose}>
      <div className="provision-modal-content provision-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="provision-modal-header">
          <div>
            <h2 className="provision-modal-title">Add Team to {workspace?.name || 'Workspace'}</h2>
            <p className="provision-modal-subtitle">
              Select team members from your roster to add to this workspace
            </p>
          </div>
          <button className="provision-modal-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="provision-modal-body">
          {teamMembers.length === 0 ? (
            <div className="provision-empty-state">
              <p>Your agency roster is empty.</p>
              <p>Add team members in the Agency Team section first.</p>
            </div>
          ) : (
            <>
              {/* Active Members Section */}
              {groupedMembers.active.length > 0 && (
                <div className="provision-section">
                  <div className="provision-section-header">
                    <h3>Active Team Members</h3>
                    <span className="provision-section-info">
                      Will be added directly to workspace
                    </span>
                    <button
                      type="button"
                      className="select-all-button"
                      onClick={() => handleSelectAll(groupedMembers.active)}
                    >
                      {groupedMembers.active.every(m => selectedMembers[m.id]) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="provision-members-list">
                    {groupedMembers.active.map(member => (
                      <div key={member.id} className="provision-member-row">
                        <label className="provision-member-checkbox">
                          <input
                            type="checkbox"
                            checked={!!selectedMembers[member.id]}
                            onChange={() => handleToggleMember(member.id)}
                            disabled={isSubmitting}
                          />
                          <span className="checkmark"></span>
                        </label>
                        <div className="provision-member-info">
                          <span className="provision-member-name">
                            {member.full_name || member.email}
                          </span>
                          <span className="provision-member-email">{member.email}</span>
                          {member.department && (
                            <span className="provision-member-dept">{member.department}</span>
                          )}
                        </div>
                        <select
                          className="provision-role-select"
                          value={roleOverrides[member.id] || normalizeRole(member.default_role)}
                          onChange={(e) => handleRoleChange(member.id, e.target.value)}
                          disabled={isSubmitting}
                        >
                          {ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Members Section */}
              {groupedMembers.pending.length > 0 && (
                <div className="provision-section">
                  <div className="provision-section-header">
                    <h3>Pending Team Members</h3>
                    <span className="provision-section-info">
                      Will receive an email invitation
                    </span>
                    <button
                      type="button"
                      className="select-all-button"
                      onClick={() => handleSelectAll(groupedMembers.pending)}
                    >
                      {groupedMembers.pending.every(m => selectedMembers[m.id]) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="provision-members-list">
                    {groupedMembers.pending.map(member => (
                      <div key={member.id} className="provision-member-row">
                        <label className="provision-member-checkbox">
                          <input
                            type="checkbox"
                            checked={!!selectedMembers[member.id]}
                            onChange={() => handleToggleMember(member.id)}
                            disabled={isSubmitting}
                          />
                          <span className="checkmark"></span>
                        </label>
                        <div className="provision-member-info">
                          <span className="provision-member-name">
                            {member.full_name || member.email}
                            <span className="pending-badge">Pending</span>
                          </span>
                          <span className="provision-member-email">{member.email}</span>
                          {member.department && (
                            <span className="provision-member-dept">{member.department}</span>
                          )}
                        </div>
                        <select
                          className="provision-role-select"
                          value={roleOverrides[member.id] || normalizeRole(member.default_role)}
                          onChange={(e) => handleRoleChange(member.id, e.target.value)}
                          disabled={isSubmitting}
                        >
                          {ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && <div className="provision-error">{error}</div>}
        </div>

        <div className="provision-modal-actions">
          <button
            type="button"
            className="provision-skip-button"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Skip
          </button>
          <button
            type="button"
            className="provision-submit-button"
            onClick={handleProvision}
            disabled={isSubmitting || teamMembers.length === 0}
          >
            {isSubmitting
              ? 'Adding...'
              : `Add ${getSelectedCount()} Team Member${getSelectedCount() !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};
