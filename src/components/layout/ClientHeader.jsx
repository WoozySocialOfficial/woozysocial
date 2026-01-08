import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import "./ClientHeader.css";

export const ClientHeader = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [showDropdown, setShowDropdown] = useState(false);
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

  return (
    <div className="client-header">
      <div className="client-header-left">
      </div>

      <div className="client-header-right">
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
