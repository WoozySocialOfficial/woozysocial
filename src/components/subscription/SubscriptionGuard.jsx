import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import './SubscriptionGuard.css';

export const SubscriptionGuard = ({
  children,
  showOverlay = true,
  showBanner = false,
  message = "Subscribe to unlock this feature"
}) => {
  const { hasActiveProfile, subscriptionStatus, isWhitelisted, profile } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const handleUpgradeClick = () => {
    navigate('/pricing');
  };

  // Check if workspace has an active profile key (multi-workspace support)
  const workspaceHasProfile = !!activeWorkspace?.ayr_profile_key;

  // User has access if:
  // 1. User profile has an active subscription, OR
  // 2. User is whitelisted (dev/test accounts), OR
  // 3. User has active subscription status, OR
  // 4. Active workspace has an Ayrshare profile key
  const hasAccess = hasActiveProfile ||
    isWhitelisted ||
    profile?.is_whitelisted ||
    subscriptionStatus === 'active' ||
    workspaceHasProfile;

  // If user has access, show children without restrictions
  if (hasAccess) {
    return <>{children}</>;
  }

  // If showBanner mode, show a dismissible banner at the top
  if (showBanner) {
    return (
      <>
        <div className="subscription-banner">
          <div className="subscription-banner-content">
            <div className="subscription-banner-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 6V10L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="subscription-banner-text">
              <strong>Subscription Required</strong>
              <span>{message}</span>
            </div>
            <button className="subscription-banner-button" onClick={handleUpgradeClick}>
              Upgrade Now
            </button>
          </div>
        </div>
        {children}
      </>
    );
  }

  // If showOverlay mode (default), show content with a locked overlay
  if (showOverlay) {
    return (
      <div className="subscription-guard">
        <div className="subscription-guard-content blurred">
          {children}
        </div>
        <div className="subscription-guard-overlay">
          <div className="subscription-guard-card">
            <div className="subscription-guard-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="48" height="48" rx="24" fill="#6961f6" fillOpacity="0.1"/>
                <path d="M24 14V18M24 26V30M16 22L14 24L16 26M32 22L34 24L32 26M20 30L18 32M28 30L30 32M20 18L18 16M28 18L30 16" stroke="#6961f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="24" cy="24" r="4" stroke="#6961f6" strokeWidth="2"/>
              </svg>
            </div>
            <h3 className="subscription-guard-title">
              {subscriptionStatus === 'inactive' ? 'Subscription Required' : 'Upgrade Required'}
            </h3>
            <p className="subscription-guard-message">
              {message}
            </p>
            <button className="subscription-guard-button" onClick={handleUpgradeClick}>
              View Plans & Pricing
            </button>
            {isWhitelisted && (
              <p className="subscription-guard-note">
                Your account is whitelisted for testing, but this feature requires an active subscription in production.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // No overlay or banner - just hide the children
  return null;
};
