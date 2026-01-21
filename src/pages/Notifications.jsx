import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
import { LoadingContainer } from "../components/ui/LoadingSpinner";
import "./Notifications.css";

// Notification type configurations
const NOTIFICATION_CONFIG = {
  // Approval workflow
  approval_request: {
    icon: "📋",
    route: "/client/approvals",
    color: "#f59e0b"
  },
  post_approved: {
    icon: "✅",
    route: "/approvals",
    color: "#10b981"
  },
  post_rejected: {
    icon: "❌",
    route: "/approvals",
    color: "#ef4444"
  },
  changes_requested: {
    icon: "📝",
    route: "/approvals",
    color: "#f59e0b"
  },

  // Workspace/Team
  workspace_invite: {
    icon: "✉️",
    route: "/accept-invite",
    color: "#8b5cf6"
  },
  invite_accepted: {
    icon: "🎉",
    route: "/team",
    color: "#10b981"
  },
  invite_declined: {
    icon: "😔",
    route: "/team",
    color: "#6b7280"
  },
  invite_cancelled: {
    icon: "🚫",
    route: "/team",
    color: "#ef4444"
  },
  role_changed: {
    icon: "👤",
    route: "/team",
    color: "#3b82f6"
  },
  member_joined: {
    icon: "👋",
    route: "/team",
    color: "#10b981"
  },
  member_removed: {
    icon: "👋",
    route: "/team",
    color: "#6b7280"
  },

  // Posts/Scheduling
  post_scheduled: {
    icon: "📅",
    route: "/schedule",
    color: "#3b82f6"
  },
  post_published: {
    icon: "🚀",
    route: "/posts",
    color: "#10b981"
  },
  post_failed: {
    icon: "⚠️",
    route: "/posts",
    color: "#ef4444"
  },
  post_reminder: {
    icon: "⏰",
    route: "/schedule",
    color: "#f59e0b"
  },

  // Comments
  new_comment: {
    icon: "💬",
    route: "/approvals",
    color: "#3b82f6"
  },
  comment_mention: {
    icon: "📣",
    route: "/approvals",
    color: "#8b5cf6"
  },

  // Social Accounts
  social_account_linked: {
    icon: "🔗",
    route: "/settings/social-accounts",
    color: "#10b981"
  },
  social_account_unlinked: {
    icon: "🔓",
    route: "/settings/social-accounts",
    color: "#f59e0b"
  },

  // Social Inbox
  inbox_message: {
    icon: "📩",
    route: "/social-inbox",
    color: "#3b82f6"
  },
  inbox_mention: {
    icon: "📢",
    route: "/social-inbox",
    color: "#8b5cf6"
  },

  // Default
  default: {
    icon: "🔔",
    route: "/dashboard",
    color: "#6b7280"
  }
};

export const Notifications = () => {
  const { user } = useAuth();
  const { activeWorkspace, isClientRole } = useWorkspace();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, unread

  // Get notification config with fallback
  const getConfig = (type) => NOTIFICATION_CONFIG[type] || NOTIFICATION_CONFIG.default;

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const url = activeWorkspace
        ? `${baseURL}/api/notifications/list?userId=${user.id}&workspaceId=${activeWorkspace.id}`
        : `${baseURL}/api/notifications/list?userId=${user.id}`;

      const res = await fetch(url);

      if (res.ok) {
        const response = await res.json();
        const data = response.data || response;
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  }, [user, activeWorkspace]);

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    if (!user) return;

    try {
      await fetch(`${baseURL}/api/notifications/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          notificationIds: [notificationId]
        })
      });

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    if (!user) return;

    try {
      await fetch(`${baseURL}/api/notifications/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          markAllRead: true
        })
      });

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  // Handle notification click
  const handleNotificationClick = (notification) => {
    // Mark as read if unread
    if (!notification.read) {
      markAsRead(notification.id);
    }

    // Navigate based on notification type
    const config = getConfig(notification.type);
    let route = config.route;

    switch (notification.type) {
      case 'approval_request':
        route = isClientRole ? '/client/approvals' : '/approvals';
        break;
      case 'post_approved':
      case 'post_rejected':
      case 'changes_requested':
        route = isClientRole ? '/client/approvals' : '/approvals';
        break;
      case 'workspace_invite':
        if (notification.metadata?.inviteToken) {
          route = `/accept-invite?token=${notification.metadata.inviteToken}`;
        }
        break;
      case 'new_comment':
      case 'comment_mention':
        if (notification.post_id) {
          route = isClientRole ? '/client/approvals' : '/approvals';
        }
        break;
      default:
        break;
    }

    navigate(route);
  };

  // Fetch on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Filter notifications
  const filteredNotifications = notifications.filter(n => {
    if (filter === "unread") return !n.read;
    return true;
  });

  // Group by date
  const groupedNotifications = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = {
      today: [],
      yesterday: [],
      older: []
    };

    filteredNotifications.forEach(notification => {
      const notifDate = new Date(notification.created_at);
      notifDate.setHours(0, 0, 0, 0);

      if (notifDate.getTime() === today.getTime()) {
        groups.today.push(notification);
      } else if (notifDate.getTime() === yesterday.getTime()) {
        groups.yesterday.push(notification);
      } else {
        groups.older.push(notification);
      }
    });

    return groups;
  };

  const groups = groupedNotifications();
  const unreadCount = notifications.filter(n => !n.read).length;

  const renderNotificationItem = (notification) => {
    const config = getConfig(notification.type);

    return (
      <div
        key={notification.id}
        className={`notif-item ${!notification.read ? 'notif-unread' : 'notif-read'}`}
        onClick={() => handleNotificationClick(notification)}
      >
        <span
          className="notif-icon"
          style={{ backgroundColor: `${config.color}20` }}
        >
          {config.icon}
        </span>
        <div className="notif-content">
          <div className="notif-title">{notification.title}</div>
          {notification.message && (
            <div className="notif-message">{notification.message}</div>
          )}
          <div className="notif-time">{formatTime(notification.created_at)}</div>
        </div>
        {!notification.read && <span className="notif-unread-dot" />}
      </div>
    );
  };

  return (
    <div className="notifications-page">
      <div className="notifications-container">
        <div className="notifications-header">
          <h1>Notifications</h1>
          <div className="notifications-actions">
            {unreadCount > 0 && (
              <button className="mark-all-read-btn" onClick={markAllAsRead}>
                Mark all as read ({unreadCount})
              </button>
            )}
          </div>
        </div>

        <div className="notifications-filters">
          <button
            className={`filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({notifications.length})
          </button>
          <button
            className={`filter-btn ${filter === "unread" ? "active" : ""}`}
            onClick={() => setFilter("unread")}
          >
            Unread ({unreadCount})
          </button>
        </div>

        <div className="notifications-content">
          {loading ? (
            <LoadingContainer message="Loading notifications..." />
          ) : filteredNotifications.length === 0 ? (
            <div className="notifications-empty">
              <span className="empty-icon">🔔</span>
              <p>No notifications</p>
              <span className="empty-subtext">
                {filter === "unread"
                  ? "You're all caught up!"
                  : "We'll notify you when something important happens"}
              </span>
            </div>
          ) : (
            <>
              {groups.today.length > 0 && (
                <div className="notif-group">
                  <div className="notif-group-header">Today</div>
                  {groups.today.map(renderNotificationItem)}
                </div>
              )}
              {groups.yesterday.length > 0 && (
                <div className="notif-group">
                  <div className="notif-group-header">Yesterday</div>
                  {groups.yesterday.map(renderNotificationItem)}
                </div>
              )}
              {groups.older.length > 0 && (
                <div className="notif-group">
                  <div className="notif-group-header">Earlier</div>
                  {groups.older.map(renderNotificationItem)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
