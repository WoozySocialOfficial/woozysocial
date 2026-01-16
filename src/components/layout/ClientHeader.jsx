import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { baseURL } from "../../utils/constants";
import { NotificationBell } from "../NotificationBell";
import "./ClientHeader.css";

export const ClientHeader = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const profileRef = useRef(null);

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

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
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
    <div className="client-header">
      <div style={{ flex: 1 }}></div>

      <div className="client-header-right">
        <NotificationBell />
        <div className="client-profile-section" ref={profileRef}>
          <div
            className="client-profile-avatar"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            {profile?.full_name || user?.email || 'User'}
          </div>
          {showDropdown && (
            <div className="client-profile-dropdown">
              <div className="client-dropdown-header">
                <div className="client-dropdown-name">{profile?.full_name || 'User'}</div>
                <div className="client-dropdown-email">{user?.email}</div>
                <div className="client-dropdown-role">Client Access</div>
              </div>
              <div className="client-dropdown-divider" />
              <button
                className="client-dropdown-item notifications-link"
                onClick={() => {
                  setShowDropdown(false);
                  navigate('/client/notifications');
                }}
              >
                Notifications
              </button>
              <button
                className="client-dropdown-item connect-accounts"
                onClick={handleConnectSocialAccounts}
                disabled={isLinking}
              >
                {isLinking ? 'Opening...' : 'Connect Social Accounts'}
              </button>
              <button className="client-dropdown-item sign-out" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
