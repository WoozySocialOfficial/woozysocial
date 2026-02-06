import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./ClientSidebar.css";
import { WorkspaceSwitcher } from "../workspace/WorkspaceSwitcher";

export const ClientSidebar = () => {
  const location = useLocation();

  const menuItems = [
    { name: "Dashboard", path: "/client/dashboard" },
    { name: "Pending Approvals", path: "/client/approvals" },
    { name: "Approved Posts", path: "/client/approved" },
    { name: "Calendar", path: "/client/calendar" },
    { name: "Team", path: "/client/team" },
    { name: "Brand Profile", path: "/client/brand-profile" },
    { name: "Social Inbox", path: "/client/social-inbox" },
    { name: "Analytics", path: "/client/analytics" }
  ];

  return (
    <div className="client-sidebar">
      <div className="client-sidebar-content">
        <div className="client-sidebar-logo">
          <img src="/assets/woozy Png.png" alt="Woozy Social" className="client-logo-image" />
        </div>

        <WorkspaceSwitcher />

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
