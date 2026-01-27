import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./Sidebar.css";
import { WorkspaceSwitcher } from "../workspace/WorkspaceSwitcher";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useInboxUnreadCount } from "../../hooks/useInboxUnreadCount";

export const Sidebar = () => {
  const location = useLocation();
  const { hasActiveProfile, hasTabAccess, subscriptionTier } = useAuth();
  const { activeWorkspace, userWorkspaces, canAccessTab, workspaceMembership } = useWorkspace();

  // Get unread count for Social Inbox badge
  const { unreadCount } = useInboxUnreadCount(activeWorkspace?.id, !!activeWorkspace?.id);

  // Show Team if user has active profile OR is part of any workspace
  const showTeam = hasActiveProfile || userWorkspaces.length > 0;

  // User is a workspace member if they have workspaces (not counting their own personal workspace)
  const isWorkspaceMember = userWorkspaces.length > 0;

  const menuItems = [
    { name: "Dashboard", path: "/dashboard", tabName: "dashboard" },
    { name: "Brand Profile", path: "/brand-profile", tabName: "brand-profile" },
    { name: "Compose", path: "/compose", tabName: "compose" },
    { name: "Schedule", path: "/schedule", tabName: "schedule" },
    { name: "Posts", path: "/posts", tabName: "posts" },
    { name: "Engagement", path: "/engagement", tabName: "engagement" },
    { name: "Social Inbox", path: "/social-inbox", tabName: "social-inbox" },
    { name: "Team", path: "/team", tabName: "team", requiresSubscriptionOrTeam: true },
    { name: "Agency Team", path: "/agency-team", tabName: "agency-team", agencyOnly: true },
    { name: "Approvals", path: "/approvals", tabName: "approvals", requiresSubscriptionOrTeam: true },
    { name: "Settings", path: "/settings", tabName: "settings", ownerAdminOnly: true }
  ];

  // Filter menu items based on subscription tier, role, and team status
  const visibleMenuItems = menuItems.filter(item => {
    // Owner/Admin-only items (like Settings)
    if (item.ownerAdminOnly) {
      const userRole = workspaceMembership?.role;
      return userRole === 'owner' || userRole === 'admin';
    }

    // Agency-only items require agency subscription tier
    // If user has agency tier, show the item (skip role-based checks for agency features)
    if (item.agencyOnly) {
      return subscriptionTier === 'agency';
    }

    // If user is a workspace member, check role-based tab access
    // This allows team members to see tabs based on their role, not personal subscription
    if (isWorkspaceMember && canAccessTab) {
      const roleBasedAccess = canAccessTab(item.tabName);
      if (!roleBasedAccess) {
        return false;
      }
    } else {
      // User is not in a workspace, check their personal subscription tier
      if (!hasTabAccess(item.tabName)) {
        return false;
      }
    }

    // Legacy check for team-based features
    if (item.requiresSubscriptionOrTeam) {
      return showTeam;
    }

    return true;
  });

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        <div className="sidebar-logo">
          <img src="/assets/woozydark.png" alt="Woozy Social" className="sidebar-logo-image" />
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
              <div className="menu-item-text">
                {item.name}
                {item.path === "/social-inbox" && unreadCount > 0 && (
                  <span className="menu-item-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
