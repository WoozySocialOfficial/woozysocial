import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./Sidebar.css";
import { WorkspaceSwitcher } from "../workspace/WorkspaceSwitcher";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";

export const Sidebar = () => {
  const location = useLocation();
  const { hasActiveProfile } = useAuth();
  const { userWorkspaces } = useWorkspace();

  // Show Team if user has active profile OR is part of any workspace
  const showTeam = hasActiveProfile || userWorkspaces.length > 0;

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
    { name: "Settings", path: "/settings" }
  ];

  // Filter menu items based on subscription/team status
  const visibleMenuItems = menuItems.filter(item => {
    if (item.requiresSubscriptionOrTeam) {
      return showTeam;
    }
    return true;
  });

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        <div className="sidebar-logo">
          <img src="/ChatGPT Image Dec 31, 2025, 04_19_09 PM.png" alt="Woozy Social" className="sidebar-logo-image" />
        </div>

        <div className="sidebar-workspace-switcher">
          <WorkspaceSwitcher />
        </div>

        <div className="sidebar-menu">
          {visibleMenuItems.map((item, index) => (
            <Link
              key={index}
              to={item.path}
              className={`menu-item ${location.pathname === item.path ? "active" : ""}`}
            >
              <div className="menu-item-text">{item.name}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
