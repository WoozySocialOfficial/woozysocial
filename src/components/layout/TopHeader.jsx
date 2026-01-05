import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { WorkspaceSwitcher } from "../workspace/WorkspaceSwitcher";
import { baseURL } from "../../utils/constants";
import "./TopHeader.css";
import notificationIcon from "./vector-15.svg";

export const TopHeader = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleConnectSocialAccounts = async () => {
    if (!user || isLinking) return;

    try {
      setIsLinking(true);
      setShowDropdown(false);

      const r = await fetch(`${baseURL}/api/generate-jwt?userId=${user.id}`);
      if (!r.ok) throw new Error("Failed to generate link");
      const d = await r.json();

      const width = 900;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      window.open(
        d.url,
        "AyrshareLink",
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`
      );
    } catch (err) {
      console.error("Error connecting social accounts:", err);
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="top-header">
      <div className="header-right">
        <div className="notification-wrapper">
          <img className="notification-icon" alt="Notifications" src={notificationIcon} />
        </div>
        <div className="profile-section">
          <div
            className="profile-avatar"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            {profile?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          {showDropdown && (
            <div className="profile-dropdown">
              <div className="profile-dropdown-header">
                <div className="profile-dropdown-name">{profile?.full_name || 'User'}</div>
                <div className="profile-dropdown-email">{user?.email}</div>
              </div>
              <div className="profile-dropdown-divider" />
              <button
                className="profile-dropdown-item connect-accounts"
                onClick={handleConnectSocialAccounts}
                disabled={isLinking}
              >
                {isLinking ? 'Opening...' : 'Connect Social Accounts'}
              </button>
              <button className="profile-dropdown-item sign-out" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="logo-container">
        <WorkspaceSwitcher />
      </div>
    </div>
  );
};
