import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { baseURL, SUBSCRIPTION_TIERS, hasTabAccess } from "../../utils/constants";
import { NotificationBell } from "../NotificationBell";
import "./TopHeader.css";

export const TopHeader = () => {
  const { user, profile, signOut, hasActiveProfile, subscriptionTier } = useAuth();
  const { activeWorkspace, workspaceMembership, userWorkspaces } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const profileRef = useRef(null);

  // Allow owners, admins, and clients to connect social accounts
  // This allows clients to link their own social media accounts directly
  const canManageSocialAccounts = workspaceMembership?.role === 'owner' ||
                                   workspaceMembership?.role === 'admin' ||
                                   workspaceMembership?.role === 'client';

  const menuItems = [
    { name: "Dashboard", path: "/dashboard", tab: "dashboard" },
    { name: "Brand Profile", path: "/brand-profile", tab: "brand-profile" },
    { name: "Compose", path: "/compose", tab: "compose" },
    { name: "Schedule", path: "/schedule", tab: "schedule" },
    { name: "Posts", path: "/posts", tab: "posts" },
    { name: "Assets", path: "/assets", tab: "assets" },
    { name: "Engagement", path: "/engagement", tab: "engagement" },
    { name: "Social Inbox", path: "/social-inbox", tab: "social-inbox" },
    { name: "Team", path: "/team", tab: "team" },
    { name: "Approvals", path: "/approvals", tab: "approvals" },
    { name: "Settings", path: "/settings", tab: "settings" }
  ];

  // Filter menu items based on subscription tier
  const visibleMenuItems = menuItems.filter(item => {
    // Check subscription tier access for each tab
    return hasTabAccess(subscriptionTier, item.tab);
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => document.removeEventListener('click', handleClickOutside);
  }, [showDropdown]);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleConnectSocialAccounts = async () => {
    if (!user || isLinking || !activeWorkspace) return;

    try {
      setIsLinking(true);
      setShowDropdown(false);

      const r = await fetch(`${baseURL}/api/generate-jwt?workspaceId=${activeWorkspace.id}`);
      if (!r.ok) throw new Error("Failed to generate link");
      const d = await r.json();
      const url = d.data?.url || d.url;

      const width = 900;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        url,
        "AyrshareLink",
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`
      );

      // Check if popup was blocked
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // Popup was blocked - open in same window instead
        if (window.confirm('Popup was blocked. Click OK to open in a new tab, or allow popups for this site.')) {
          window.open(url, '_blank');
        }
        setIsLinking(false);
        return;
      }

      // Poll to detect when popup closes
      const pollTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollTimer);
          setIsLinking(false);
          // Dispatch custom event so other components can refresh
          window.dispatchEvent(new CustomEvent('socialAccountsUpdated'));
        }
      }, 500);
    } catch (err) {
      console.error("Error connecting social accounts:", err);
      setIsLinking(false);
    }
  };

  const handleManageSubscription = () => {
    // Always route to pricing page
    setShowDropdown(false);
    navigate('/pricing');
  };

  return (
    <>
      <div className="top-header">
        {/* Mobile Menu Button */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>

        <div style={{ flex: 1 }}></div>

        <div className="header-right">
          <NotificationBell />
          <div className="profile-section" ref={profileRef}>
            <div
              className="profile-avatar"
              onClick={() => setShowDropdown(!showDropdown)}
            >
              {profile?.full_name || user?.email || 'User'}
            </div>
            {showDropdown && (
              <div className="profile-dropdown">
                <div className="profile-dropdown-header">
                  <div className="profile-dropdown-name">{profile?.full_name || 'User'}</div>
                  <div className="profile-dropdown-email">{user?.email}</div>
                </div>
                <div className="profile-dropdown-divider" />
                <button
                  className="profile-dropdown-item profile-settings-link"
                  onClick={() => {
                    setShowDropdown(false);
                    navigate('/profile-settings');
                  }}
                >
                  Profile Settings
                </button>
                <button
                  className="profile-dropdown-item notifications-link"
                  onClick={() => {
                    setShowDropdown(false);
                    navigate('/notifications');
                  }}
                >
                  Notifications
                </button>
                <button
                  className="profile-dropdown-item manage-subscription"
                  onClick={handleManageSubscription}
                >
                  Manage Subscription
                </button>
                {canManageSocialAccounts && (
                  <button
                    className="profile-dropdown-item connect-accounts"
                    onClick={handleConnectSocialAccounts}
                    disabled={isLinking}
                  >
                    {isLinking ? 'Opening...' : 'Connect Social Accounts'}
                  </button>
                )}
                <button className="profile-dropdown-item sign-out" onClick={handleSignOut}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation Overlay */}
      <div
        className={`mobile-nav-overlay ${mobileNavOpen ? 'open' : ''}`}
        onClick={() => setMobileNavOpen(false)}
      />

      {/* Mobile Navigation Panel */}
      <div className={`mobile-nav ${mobileNavOpen ? 'open' : ''}`}>
        <div className="mobile-nav-header">
          <img
            src="/assets/woozysocial.png"
            alt="Woozy Social"
            style={{ height: '75px', objectFit: 'contain' }}
          />
          <button
            className="mobile-nav-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <div className="mobile-nav-items">
          {visibleMenuItems.map((item, index) => (
            <Link
              key={index}
              to={item.path}
              className={`mobile-nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => setMobileNavOpen(false)}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
};
