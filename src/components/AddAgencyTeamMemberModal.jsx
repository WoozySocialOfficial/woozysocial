/**
 * AddAgencyTeamMemberModal - Add/Edit team members to agency roster
 */
import { useState, useEffect } from "react";
import { baseURL } from "../utils/constants";
import "./AddAgencyTeamMemberModal.css";

const ROLES = [
  {
    value: "member",
    label: "Member",
    description: "Can create, edit, and manage posts"
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "Read-only access - can view posts and team members"
  }
];

export const AddAgencyTeamMemberModal = ({
  isOpen,
  onClose,
  onSuccess,
  editingMember,
  userId
}) => {
  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
    defaultRole: "editor",
    department: "",
    notes: ""
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = !!editingMember;

  // Populate form when editing
  useEffect(() => {
    if (editingMember) {
      setFormData({
        email: editingMember.email || "",
        fullName: editingMember.full_name || "",
        defaultRole: editingMember.default_role || "editor",
        department: editingMember.department || "",
        notes: editingMember.notes || ""
      });
    } else {
      setFormData({
        email: "",
        fullName: "",
        defaultRole: "editor",
        department: "",
        notes: ""
      });
    }
    setErrors({});
  }, [editingMember, isOpen]);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});

    // Validation
    const newErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = isEditing
        ? `${baseURL}/api/agency-team/update`
        : `${baseURL}/api/agency-team/add`;

      const body = isEditing
        ? {
            userId,
            teamMemberId: editingMember.id,
            fullName: formData.fullName.trim() || null,
            defaultRole: formData.defaultRole,
            department: formData.department.trim() || null,
            notes: formData.notes.trim() || null
          }
        : {
            userId,
            email: formData.email.trim().toLowerCase(),
            fullName: formData.fullName.trim() || null,
            defaultRole: formData.defaultRole,
            department: formData.department.trim() || null,
            notes: formData.notes.trim() || null
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${isEditing ? 'update' : 'add'} team member`);
      }

      onSuccess?.();
      handleClose();
    } catch (error) {
      setErrors({ submit: error.message || `Failed to ${isEditing ? 'update' : 'add'} team member` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      email: "",
      fullName: "",
      defaultRole: "editor",
      department: "",
      notes: ""
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="agency-modal-overlay" onClick={handleClose}>
      <div className="agency-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="agency-modal-header">
          <h2 className="agency-modal-title">
            {isEditing ? "Edit Team Member" : "Add Team Member"}
          </h2>
          <button className="agency-modal-close-button" onClick={handleClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="agency-team-form">
          <div className="agency-form-group">
            <label className="agency-form-label">
              Email Address <span className="required">*</span>
            </label>
            <input
              type="email"
              className={`agency-form-input ${errors.email ? 'error' : ''}`}
              placeholder="teammate@example.com"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              disabled={isSubmitting || isEditing}
            />
            {errors.email && (
              <span className="agency-error-message">{errors.email}</span>
            )}
            {isEditing && (
              <span className="agency-field-note">Email cannot be changed after adding</span>
            )}
          </div>

          <div className="agency-form-group">
            <label className="agency-form-label">Full Name</label>
            <input
              type="text"
              className="agency-form-input"
              placeholder="John Smith"
              value={formData.fullName}
              onChange={(e) => handleChange('fullName', e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="agency-form-group">
            <label className="agency-form-label">Default Role</label>
            <select
              className="agency-form-select"
              value={formData.defaultRole}
              onChange={(e) => handleChange('defaultRole', e.target.value)}
              disabled={isSubmitting}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="agency-role-description">
              {ROLES.find(r => r.value === formData.defaultRole)?.description}
            </div>
          </div>

          <div className="agency-form-group">
            <label className="agency-form-label">Department</label>
            <input
              type="text"
              className="agency-form-input"
              placeholder="e.g., Content, Design, Account Management"
              value={formData.department}
              onChange={(e) => handleChange('department', e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="agency-form-group">
            <label className="agency-form-label">Notes</label>
            <textarea
              className="agency-form-textarea"
              placeholder="Any additional notes about this team member..."
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          {errors.submit && (
            <div className="agency-submit-error">{errors.submit}</div>
          )}

          <div className="agency-modal-actions">
            <button
              type="button"
              className="agency-cancel-button"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="agency-submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? (isEditing ? "Saving..." : "Adding...")
                : (isEditing ? "Save Changes" : "Add to Roster")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
