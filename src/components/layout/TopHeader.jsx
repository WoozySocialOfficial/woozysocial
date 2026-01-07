import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { baseURL } from "../../utils/constants";
import "./TopHeader.css";
import notificationIcon from "./vector-15.svg";

export const TopHeader = () => {
  const { user, profile, signOut } = useAuth();
  const { activeWorkspace, workspaceMembership } = useWorkspace();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const profileRef = useRef(null);

  // Check if current user is the workspace owner or admin (can manage social accounts)
  const canManageSocialAccounts = workspaceMembership?.role === 'owner' || workspaceMembership?.role === 'admin';

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

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleConnectSocialAccounts = async () => {
    if (!user || isLinking || !activeWorkspace) return;

    try {
      setIsLinking(true);
      setShowDropdown(false);

      const r = await fetch(`${baseURL}/api/generate-jwt?userId=${user.id}&workspaceId=${activeWorkspace.id}`);
      if (!r.ok) throw new Error("Failed to generate link");
      const d = await r.json();

      const width = 900;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        d.url,
        "AyrshareLink",
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`
      );

      // Poll to detect when popup closes
      if (popup) {
        const pollTimer = setInterval(() => {
          if (popup.closed) {
            clearInterval(pollTimer);
            setIsLinking(false);
            // Dispatch custom event so other components can refresh
            window.dispatchEvent(new CustomEvent('socialAccountsUpdated'));
          }
        }, 500);
      }
    } catch (err) {
      console.error("Error connecting social accounts:", err);
      setIsLinking(false);
    }
  };

  return (
    <div className="top-header">
      <div className="logo-container">
      </div>

      <div className="header-right">
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
  );
};
