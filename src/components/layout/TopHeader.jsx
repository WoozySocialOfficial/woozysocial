import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { baseURL } from "../../utils/constants";
import { NotificationBell } from "../NotificationBell";
import "./TopHeader.css";

export const TopHeader = () => {
  const { user, profile, signOut, hasActiveProfile } = useAuth();
  const { activeWorkspace, workspaceMembership, userWorkspaces } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const profileRef = useRef(null);

  // Check if current user is the workspace owner or admin (can manage social accounts)
  const canManageSocialAccounts = workspaceMembership?.role === 'owner' || workspaceMembership?.role === 'admin';

  // Show Team if user has active profile OR is part of any workspace
  const showTeam = hasActiveProfile || userWorkspaces?.length > 0;

  const menuItems = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Brand Profile", path: "/brand-profile" },
    { name: "Compose", path: "/compose" },
    { name: "Schedule", path: "/schedule" },
    { name: "Posts", path: "/posts" },
    { name: "Assets", path: "/assets" },
    { name: "Engagement", path: "/engagement" },
    { name: "Social Inbox", path: "/social-inbox" },
    { name: "Team", path: "/team", requiresSubscriptionOrTeam: true },
    { name: "Approvals", path: "/approvals", requiresSubscriptionOrTeam: true },
    { name: "Settings", path: "/settings" }
  ];

  const visibleMenuItems = menuItems.filter(item => {
    if (item.requiresSubscriptionOrTeam) {
      return showTeam;
    }
    return true;
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

        <div className="logo-container">
          <img src="/assets/woozysocial.png" alt="Woozy Social" />
        </div>

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
