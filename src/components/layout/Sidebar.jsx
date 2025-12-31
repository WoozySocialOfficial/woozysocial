import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./Sidebar.css";

export const Sidebar = () => {
  const location = useLocation();

  const menuItems = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Brand Profile", path: "/brand-profile" },
    { name: "Compose", path: "/compose" },
    { name: "Schedule", path: "/schedule" },
    { name: "Posts", path: "/posts" },
    { name: "Assets", path: "/assets" },
    { name: "Social Inbox", path: "/social-inbox" },
    { name: "Team", path: "/team" },
    { name: "Settings", path: "/settings" }
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        <div className="sidebar-logo">
          <div className="sidebar-logo-text">[LOGO]</div>
        </div>

        <Link to="/compose" className="add-post-button">
          +Add Post
        </Link>

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
