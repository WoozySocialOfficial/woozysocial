import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./ClientSidebar.css";
import { useWorkspace } from "../../contexts/WorkspaceContext";

export const ClientSidebar = () => {
  const location = useLocation();
  const { activeWorkspace } = useWorkspace();

  const menuItems = [
    { name: "Dashboard", path: "/client/dashboard" },
    { name: "Pending Approvals", path: "/client/approvals" },
    { name: "Approved Posts", path: "/client/approved" },
    { name: "Calendar", path: "/client/calendar" }
  ];

  return (
    <div className="client-sidebar">
      <div className="client-sidebar-content">
        <div className="client-sidebar-logo">
          <img src="/ChatGPT Image Dec 31, 2025, 04_19_09 PM.png" alt="Woozy Social" className="client-logo-image" />
        </div>

        <div className="client-workspace-info">
          {activeWorkspace && (
            <>
              <div className="client-workspace-avatar">
                {activeWorkspace.name?.charAt(0).toUpperCase() || "W"}
              </div>
              <div className="client-workspace-details">
                <div className="client-workspace-name">{activeWorkspace.name}</div>
                <div className="client-workspace-role">Client Portal</div>
              </div>
            </>
          )}
        </div>

        <div className="client-sidebar-menu">
          {menuItems.map((item, index) => (
            <Link
              key={index}
              to={item.path}
              className={`client-menu-item ${location.pathname === item.path ? "active" : ""}`}
            >
              <div className="client-menu-item-text">{item.name}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
