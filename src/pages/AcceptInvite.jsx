import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabaseClient';
import './AcceptInvite.css';

export const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const validateInvitation = async () => {
    try {
      setLoading(true);

      // Fetch invitation by token via API (to bypass RLS)
      const response = await fetch(`http://localhost:3001/api/team/validate-invite?token=${token}`);

      if (!response.ok) {
        const result = await response.json();
        setError(result.error || 'Invitation not found or invalid');
        setLoading(false);
        return;
      }

      const result = await response.json();

      if (!result.data) {
        setError('Invitation not found or invalid');
        setLoading(false);
        return;
      }

      const data = result.data;

      // Check if already accepted
      if (data.status === 'accepted') {
        setError('This invitation has already been accepted');
        setLoading(false);
        return;
      }

      // Check if cancelled
      if (data.status === 'cancelled') {
        setError('This invitation has been cancelled');
        setLoading(false);
        return;
      }

      // Check if expired
      const expiresAt = new Date(data.expires_at);
      if (new Date() > expiresAt) {
        setError('This invitation has expired');
        setLoading(false);
        return;
      }

      // Check if user is already a team member
      if (user) {
        const { data: existingMember } = await supabase
          .from('team_members')
          .select('id')
          .eq('owner_id', data.owner_id)
          .eq('member_id', user.id)
          .single();

        if (existingMember) {
          setError('You are already a member of this team');
          setLoading(false);
          return;
        }
      }

      setInvitation(data);
      setLoading(false);
    } catch (error) {
      console.error('Error validating invitation:', error);
      setError('An error occurred while validating the invitation');
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

      // Call the API endpoint to accept invitation
      const response = await fetch('http://localhost:3001/api/team/accept-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invitation');
      }

      // Success! Redirect to team page
      navigate('/team', { state: { message: 'You have successfully joined the team!' } });
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

      // Update invitation status to rejected
      const { error: updateError } = await supabase
        .from('team_invitations')
        .update({ status: 'rejected' })
        .eq('invite_token', token);

      if (updateError) {
        throw updateError;
      }

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
      view_only: 'View Only',
    };
    return labels[role] || role;
  };

  const getRoleDescription = (role) => {
    const descriptions = {
      admin: 'Full access - can invite, remove members, and manage all posts',
      editor: 'Can create, edit, and delete posts',
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
          <div className="error-icon">❌</div>
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
          <div className="invite-icon">✉️</div>
          <h1 className="invite-title">You're Invited!</h1>
          <p className="invite-subtitle">You've been invited to join a team</p>
        </div>

        <div className="invite-details">
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
