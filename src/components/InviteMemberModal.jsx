import React, { useState } from "react";
import "./InviteMemberModal.css";

const ROLES = [
  {
    value: "admin",
    label: "Admin",
    description: "Full access - can invite, remove members, and manage all posts"
  },
  {
    value: "editor",
    label: "Editor",
    description: "Can create, edit, and delete posts"
  },
  {
    value: "view_only",
    label: "View Only",
    description: "Read-only access - can view posts and team members"
  },
  {
    value: "client",
    label: "Client",
    description: "Can view and approve scheduled posts before they go live"
  }
];

export const InviteMemberModal = ({ isOpen, onClose, onInvite, currentUserEmail }) => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Clear previous errors
    setErrors({});

    // Validation
    const newErrors = {};

    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(email)) {
      newErrors.email = "Please enter a valid email address";
    } else if (email.toLowerCase() === currentUserEmail?.toLowerCase()) {
      newErrors.email = "You cannot invite yourself";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Submit invitation
    setIsSubmitting(true);
    try {
      await onInvite({ email: email.trim().toLowerCase(), role });
      // Reset form
      setEmail("");
      setRole("editor");
      onClose();
    } catch (error) {
      setErrors({ submit: error.message || "Failed to send invitation" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setEmail("");
    setRole("editor");
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Invite Team Member</h2>
          <button className="modal-close-button" onClick={handleCancel}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="invite-form">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className={`form-input ${errors.email ? 'error' : ''}`}
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
            />
            {errors.email && (
              <span className="error-message">{errors.email}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Role</label>
            <select
              className="form-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isSubmitting}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="role-description">
              {ROLES.find(r => r.value === role)?.description}
            </div>
          </div>

          {errors.submit && (
            <div className="submit-error">{errors.submit}</div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="cancel-button"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="invite-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
