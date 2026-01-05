import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import './WorkspaceSwitcher.css';

export const WorkspaceSwitcher = () => {
  const { activeWorkspace, userWorkspaces, switchWorkspace, loading } = useWorkspace();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const handleWorkspaceSwitch = async (workspaceId) => {
    if (workspaceId === activeWorkspace?.id) {
      setShowDropdown(false);
      return;
    }

    const { error } = await switchWorkspace(workspaceId);
    if (error) {
      console.error('Failed to switch workspace:', error);
      // TODO: Show error toast notification
    }
    setShowDropdown(false);
    // Context switch triggers re-render of all components using workspace data
  };

  const handleSettingsClick = () => {
    setShowDropdown(false);
    navigate('/settings?tab=workspace');
  };

  // Loading skeleton while fetching workspaces
  if (loading || !activeWorkspace) {
    return (
      <div className="workspace-switcher-skeleton">
        <div className="workspace-logo-skeleton"></div>
        <div className="workspace-name-skeleton"></div>
      </div>
    );
  }

  // No workspaces (shouldn't happen after migration)
  if (userWorkspaces.length === 0) {
    return (
      <div className="workspace-switcher-empty">
        <span>No workspace</span>
      </div>
    );
  }

  return (
    <div className="workspace-switcher" ref={dropdownRef}>
      <button
        className="workspace-trigger"
        onClick={() => setShowDropdown(!showDropdown)}
        aria-label="Switch workspace"
        aria-expanded={showDropdown}
      >
        <div className="workspace-logo">
          {activeWorkspace.logo_url ? (
            <img src={activeWorkspace.logo_url} alt={activeWorkspace.name} />
          ) : (
            <span className="workspace-initial">
              {activeWorkspace.name[0]?.toUpperCase() || 'W'}
            </span>
          )}
        </div>
        <span className="workspace-name">{activeWorkspace.name}</span>
        <svg
          className={`dropdown-arrow ${showDropdown ? 'open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 4L6 8L10 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {showDropdown && (
        <div className="workspace-dropdown">
          <div className="dropdown-section">
            <div className="section-label">Workspaces</div>
            <div className="workspaces-list">
              {userWorkspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  className={`workspace-item ${workspace.id === activeWorkspace.id ? 'active' : ''}`}
                  onClick={() => handleWorkspaceSwitch(workspace.id)}
                >
                  <div className="workspace-item-logo">
                    {workspace.logo_url ? (
                      <img src={workspace.logo_url} alt={workspace.name} />
                    ) : (
                      <span className="workspace-item-initial">
                        {workspace.name[0]?.toUpperCase() || 'W'}
                      </span>
                    )}
                  </div>
                  <div className="workspace-item-info">
                    <div className="workspace-item-name">{workspace.name}</div>
                    <div className="workspace-item-role">
                      {workspace.membership?.role?.toUpperCase() || 'MEMBER'}
                    </div>
                  </div>
                  {workspace.id === activeWorkspace.id && (
                    <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M13 4L6 11L3 8"
                        stroke="#FFC801"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="dropdown-divider" />

          <button className="dropdown-action" onClick={handleSettingsClick}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="settings-icon">
              <path
                d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M13 8C13 8.34 12.99 8.67 12.96 9L14.21 9.88L13.21 11.62L11.72 11.06C11.37 11.37 10.97 11.62 10.54 11.81L10.3 13.4H8.3L8.06 11.81C7.63 11.62 7.23 11.37 6.88 11.06L5.39 11.62L4.39 9.88L5.64 9C5.61 8.67 5.6 8.34 5.6 8C5.6 7.66 5.61 7.33 5.64 7L4.39 6.12L5.39 4.38L6.88 4.94C7.23 4.63 7.63 4.38 8.06 4.19L8.3 2.6H10.3L10.54 4.19C10.97 4.38 11.37 4.63 11.72 4.94L13.21 4.38L14.21 6.12L12.96 7C12.99 7.33 13 7.66 13 8Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Settings
          </button>
        </div>
      )}
    </div>
  );
};
