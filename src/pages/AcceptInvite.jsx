/**
 * ⚠️⚠️⚠️ CRITICAL PAGE - DO NOT MODIFY WITHOUT APPROVAL ⚠️⚠️⚠️
 *
 * AcceptInvite Page - Handles workspace invitation acceptance
 *
 * This page is CRITICAL for team onboarding. Breaking this breaks the entire
 * invitation flow and prevents new members from joining workspaces.
 *
 * CRITICAL REQUIREMENTS:
 * - Must parse nested API responses: result.data?.invitation || result.invitation
 * - Must validate token before showing UI
 * - Must check email match on backend (security requirement)
 * - Must refresh workspaces after successful acceptance
 *
 * See CRITICAL_FEATURES.md section "Teams & Invitation System"
 *
 * Last Stable: January 13, 2026
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { baseURL } from '../utils/constants';
import './AcceptInvite.css';

export const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshWorkspaces } = useWorkspace();
  const token = searchParams.get('token');

  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (token) {
      validateInvitation();
    } else {
      setError('Invalid invitation link');
      setLoading(false);
    }
  }, [token]);

  // Check for pending invite after login
  useEffect(() => {
    const pendingToken = localStorage.getItem('pending_invite_token');
    if (pendingToken && user && !token) {
      // Redirect with the pending token
      navigate(`/accept-invite?token=${pendingToken}`);
      localStorage.removeItem('pending_invite_token');
    }
  }, [user, token, navigate]);

  const validateInvitation = async () => {
    try {
      setLoading(true);

      const apiUrl = `${baseURL}/api/invitations/validate?token=${token}`;
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error || 'Invitation not found or invalid';

        // If invitation was already accepted, redirect to dashboard
        if (errorMessage.includes('already been accepted')) {
          navigate('/', { state: { message: 'You have already accepted this invitation!' } });
          return;
        }

        setError(errorMessage);
        setLoading(false);
        return;
      }

      // API returns data nested in "data" property
      const invitation = result.data?.invitation || result.invitation;

      if (result.success && invitation) {
        setInvitation({
          ...invitation,
          type: 'workspace'
        });
      } else {
        setError('Invitation not found or invalid');
      }
      setLoading(false);
    } catch (error) {
      console.error('Error validating invitation:', error);
      setError('An error occurred while validating the invitation. Please check your internet connection and try again.');
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!user) {
      // Save token to localStorage and redirect to login
      localStorage.setItem('pending_invite_token', token);
      navigate('/login?redirect=/accept-invite');
      return;
    }

    try {
      setAccepting(true);

      const response = await fetch(`${baseURL}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
          userId: user.id,
        }),
      });

      const data = await response.json();

      // API returns nested in "data" property
      const responseData = data.data || data;
      const message = responseData.message;

      if (!response.ok && !message?.includes('already a member')) {
        throw new Error(data.error || 'Failed to accept invitation');
      }

      // Clear workspace cache to ensure fresh data is loaded
      localStorage.removeItem('woozy_workspace_cache');

      // Refresh workspaces to load the newly joined workspace
      await refreshWorkspaces();

      // Small delay to ensure state is updated before navigation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Success! Redirect to team page (or dashboard for clients)
      const displayMessage = message || `You have successfully joined ${invitation.workspace?.name || 'the workspace'}!`;
      const redirectPath = invitation.role === 'client' ? '/client/dashboard' : '/team';
      navigate(redirectPath, { state: { message: displayMessage } });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setError(error.message || 'Failed to accept invitation');
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!window.confirm('Are you sure you want to decline this invitation?')) {
      return;
    }

    try {
      setAccepting(true);
      // For now, just navigate away - the invitation will expire
      navigate('/', { state: { message: 'Invitation declined' } });
    } catch (error) {
      console.error('Error declining invitation:', error);
      setError('Failed to decline invitation');
      setAccepting(false);
    }
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'Admin',
      editor: 'Editor',
      client: 'Client',
      view_only: 'View Only',
    };
    return labels[role] || role;
  };

  const getRoleDescription = (role) => {
    const descriptions = {
      admin: 'Full access - can invite, remove members, and manage all posts',
      editor: 'Can create, edit, and schedule posts',
      client: 'Can view and approve/reject scheduled posts',
      view_only: 'Read-only access - can view posts and team members',
    };
    return descriptions[role] || '';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="accept-invite-container">
        <div className="accept-invite-card">
          <div className="loading-spinner"></div>
          <p className="loading-text">Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="accept-invite-container">
        <div className="accept-invite-card error">
          <div className="error-icon">✕</div>
          <h1 className="error-title">Invalid Invitation</h1>
          <p className="error-message">{error}</p>
          <button className="back-button" onClick={() => navigate('/')}>
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="accept-invite-container">
      <div className="accept-invite-card">
        <div className="invite-header">
          <div className="invite-icon">✉</div>
          <h1 className="invite-title">You're Invited!</h1>
          <p className="invite-subtitle">
            {invitation.type === 'workspace'
              ? `You've been invited to ${invitation.workspace?.name || 'a business'}`
              : "You've been invited to join a team"
            }
          </p>
        </div>

        <div className="invite-details">
          {invitation.type === 'workspace' && invitation.workspace?.name && (
            <div className="detail-row">
              <span className="detail-label">Business:</span>
              <span className="detail-value business-name">{invitation.workspace.name}</span>
            </div>
          )}
          <div className="detail-row">
            <span className="detail-label">Email:</span>
            <span className="detail-value">{invitation.email}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Role:</span>
            <span className="detail-value role-badge">{getRoleLabel(invitation.role)}</span>
          </div>
          <div className="detail-row description">
            <span className="detail-description">{getRoleDescription(invitation.role)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Invited:</span>
            <span className="detail-value">{formatDate(invitation.invited_at)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Expires:</span>
            <span className="detail-value">{formatDate(invitation.expires_at)}</span>
          </div>
        </div>

        {!user && (
          <div className="auth-notice">
            <p>You need to sign in or create an account to accept this invitation.</p>
          </div>
        )}

        <div className="invite-actions">
          <button
            className="accept-button"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? 'Processing...' : user ? 'Accept Invitation' : 'Sign In to Accept'}
          </button>
          <button
            className="decline-button"
            onClick={handleDecline}
            disabled={accepting}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};
