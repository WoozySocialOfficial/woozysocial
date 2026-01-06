import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./Sidebar.css";
import { WorkspaceSwitcher } from "../workspace/WorkspaceSwitcher";

export const Sidebar = () => {
  const location = useLocation();

  const menuItems = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Brand Profile", path: "/brand-profile" },
    { name: "Compose", path: "/compose" },
    { name: "Schedule", path: "/schedule" },
    { name: "Posts", path: "/posts" },
    { name: "Assets", path: "/assets" },
    { name: "Engagement", path: "/engagement" },
    { name: "Social Inbox", path: "/social-inbox" },
    { name: "Team", path: "/team" },
    { name: "Settings", path: "/settings" }
  ];

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
          {menuItems.map((item, index) => (
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
