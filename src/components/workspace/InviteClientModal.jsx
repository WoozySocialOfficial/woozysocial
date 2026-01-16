import React, { useState } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { baseURL } from '../../utils/constants';
import './InviteClientModal.css';

export const InviteClientModal = ({ isOpen, onClose, onInviteSent }) => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('client');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    if (!activeWorkspace?.id) {
      setError('No workspace selected');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const res = await fetch(`${baseURL}/api/workspace/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          email: email.trim().toLowerCase(),
          role: role,
          invitedBy: user.id
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      setSuccess(true);
      setEmail('');

      // Copy invite link to clipboard
      const inviteLink = `${window.location.origin}/accept-invite?token=${data.invitation.inviteToken}`;

      try {
        await navigator.clipboard.writeText(inviteLink);
      } catch {
        // Clipboard access not available
      }

      if (onInviteSent) {
        onInviteSent(data.invitation);
      }

      // Close after delay
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content invite-modal">
        <div className="modal-header">
          <h2>Invite Client</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-description">
              Invite a client to view and approve scheduled posts for <strong>{activeWorkspace?.name}</strong>.
            </p>

            <div className="form-group">
              <label htmlFor="clientEmail">Email Address</label>
              <input
                type="email"
                id="clientEmail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="clientRole">Permission Level</label>
              <select
                id="clientRole"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={loading}
                className="role-select"
              >
                <option value="client">Client - Can approve/reject posts</option>
                <option value="editor">Editor - Can edit and approve posts</option>
                <option value="admin">Admin - Full access</option>
              </select>
            </div>

            <div className="role-description">
              {role === 'client' && (
                <p>Clients can view scheduled posts, add comments, and approve or reject content before it's published.</p>
              )}
              {role === 'editor' && (
                <p>Editors can create and edit posts, connect accounts, and approve content.</p>
              )}
              {role === 'admin' && (
                <p>Admins have full access including inviting other members and managing settings.</p>
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            {success && (
              <div className="success-message">
                Invitation sent! Link copied to clipboard.
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !email.trim()}
            >
              {loading ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
