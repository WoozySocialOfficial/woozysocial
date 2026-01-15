import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
import { supabase } from "../utils/supabaseClient";
import "./NotificationBell.css";

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

export const NotificationBell = () => {
  const { user } = useAuth();
  const { activeWorkspace, isClientRole, switchWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fadingOutIds, setFadingOutIds] = useState(new Set());
  const dropdownRef = useRef(null);

  // Get notification config with fallback
  const getConfig = (type) => NOTIFICATION_CONFIG[type] || NOTIFICATION_CONFIG.default;

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) {
      console.log('[NotificationBell] No user, skipping fetch');
      return;
    }

    try {
      setLoading(true);
      const url = activeWorkspace
        ? `${baseURL}/api/notifications/list?userId=${user.id}&workspaceId=${activeWorkspace.id}`
        : `${baseURL}/api/notifications/list?userId=${user.id}`;

      console.log('[NotificationBell] Fetching notifications from:', url);
      const res = await fetch(url);
      console.log('[NotificationBell] Response status:', res.status, 'ok:', res.ok);

      if (res.ok) {
        const response = await res.json();
        console.log('[NotificationBell] Received response:', response);

        // API returns { success: true, data: { notifications: [], unreadCount: 0 } }
        const data = response.data || response;
        console.log('[NotificationBell] Notifications count:', data.notifications?.length || 0);

        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
        console.log('[NotificationBell] State updated - notifications:', data.notifications?.length, 'unread:', data.unreadCount);
      } else {
        console.error('[NotificationBell] Response not ok:', res.status);
      }
    } catch (error) {
      console.error("[NotificationBell] Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  }, [user, activeWorkspace]);

  // Mark all as read with animation
  const markAllAsRead = async () => {
    if (!user || unreadCount === 0) return;

    try {
      // Get all unread notification IDs
      const unreadNotifications = notifications.filter(n => !n.read);
      const unreadIds = unreadNotifications.map(n => n.id);

      // Add to fading out set for animation
      setFadingOutIds(prev => new Set([...prev, ...unreadIds]));

      // Mark as read in backend
      await fetch(`${baseURL}/api/notifications/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          markAllRead: true
        })
      });

      // After animation completes, update state
      setTimeout(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
        setFadingOutIds(new Set());
      }, 300); // Match CSS transition duration

    } catch (error) {
      console.error("Error marking as read:", error);
      setFadingOutIds(new Set());
    }
  };

  // Handle notification click with smart routing and animation
  const handleNotificationClick = async (notification) => {
    // Mark as read with animation
    if (!notification.read) {
      // Add to fading out set for animation
      setFadingOutIds(prev => new Set(prev).add(notification.id));

      // Mark as read in backend
      fetch(`${baseURL}/api/notifications/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          notificationIds: [notification.id]
        })
      }).catch(err => console.error(err));

      // After animation, update state
      setTimeout(() => {
        setNotifications(prev =>
          prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        setFadingOutIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(notification.id);
          return newSet;
        });
      }, 300); // Match CSS transition duration
    }

    // Switch workspace if notification is from a different workspace
    if (notification.workspace_id && activeWorkspace?.id !== notification.workspace_id) {
      console.log(`[NotificationBell] Switching from workspace ${activeWorkspace?.id} to ${notification.workspace_id}`);
      await switchWorkspace(notification.workspace_id);
    }

    // Navigate based on notification type and metadata
    const config = getConfig(notification.type);
    let route = config.route;

    // Smart routing based on notification type and user role
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
        // Use invite token from metadata if available
        if (notification.metadata?.inviteToken) {
          route = `/accept-invite?token=${notification.metadata.inviteToken}`;
        }
        break;
      case 'new_comment':
      case 'comment_mention':
        // Navigate to specific post if ID available
        if (notification.post_id) {
          route = isClientRole ? '/client/approvals' : '/approvals';
        }
        break;
      default:
        break;
    }

    navigate(route);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch notifications on mount and set up real-time subscription
  useEffect(() => {
    fetchNotifications();

    // Set up Supabase real-time subscription for instant updates
    if (user) {
      const channel = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            // Add new notification to the list
            const newNotification = payload.new;
            setNotifications(prev => [newNotification, ...prev].slice(0, 50));
            setUnreadCount(prev => prev + 1);

            // Play notification sound (optional)
            playNotificationSound();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            // Update notification in list
            const updatedNotification = payload.new;
            setNotifications(prev =>
              prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
            );
            // Recalculate unread count
            setNotifications(prev => {
              const newUnread = prev.filter(n => !n.read).length;
              setUnreadCount(newUnread);
              return prev;
            });
          }
        )
        .subscribe();

      // Fallback polling every 30 seconds in case real-time fails
      const interval = setInterval(fetchNotifications, 30000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(interval);
      };
    }
  }, [user, fetchNotifications]);

  // Refetch when workspace changes
  useEffect(() => {
    if (user && activeWorkspace) {
      fetchNotifications();
    }
  }, [activeWorkspace, user, fetchNotifications]);

  // Optional: Play a subtle notification sound
  const playNotificationSound = () => {
    try {
      // Create a subtle beep using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
      // Silently fail if audio not supported
    }
  };

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

  // Group notifications by date (only show unread in dropdown)
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

    // Only show unread notifications in the dropdown
    const unreadNotifications = notifications.filter(n => !n.read);

    unreadNotifications.slice(0, 20).forEach(notification => {
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

  const renderNotificationItem = (notification) => {
    const isFadingOut = fadingOutIds.has(notification.id);

    return (
      <div
        key={notification.id}
        className={`notification-item ${!notification.read ? 'unread' : ''} ${isFadingOut ? 'fade-out' : ''}`}
        onClick={() => handleNotificationClick(notification)}
      >
        <div className="notification-content">
          <div className="notification-title">{notification.title}</div>
          {notification.message && (
            <div className="notification-message">{notification.message}</div>
          )}
          <div className="notification-time">{formatTime(notification.created_at)}</div>
        </div>
        {!notification.read && <span className="unread-dot" />}
      </div>
    );
  };

  const groups = groupedNotifications();
  const hasNotifications = notifications.length > 0;

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button
        className="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
      >
        <svg
          className="bell-icon-svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button className="mark-all-read" onClick={markAllAsRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-list">
            {loading && notifications.length === 0 ? (
              <div className="notification-empty">
                <div className="notification-loading">
                  <span className="loading-spinner"></span>
                  <p>Loading...</p>
                </div>
              </div>
            ) : !hasNotifications ? (
              <div className="notification-empty">
                <span className="empty-icon">🔔</span>
                <p>No notifications yet</p>
                <span className="empty-subtext">
                  We'll notify you when something important happens
                </span>
              </div>
            ) : (
              <>
                {groups.today.length > 0 && (
                  <div className="notification-group">
                    <div className="notification-group-header">Today</div>
                    {groups.today.map(renderNotificationItem)}
                  </div>
                )}
                {groups.yesterday.length > 0 && (
                  <div className="notification-group">
                    <div className="notification-group-header">Yesterday</div>
                    {groups.yesterday.map(renderNotificationItem)}
                  </div>
                )}
                {groups.older.length > 0 && (
                  <div className="notification-group">
                    <div className="notification-group-header">Earlier</div>
                    {groups.older.map(renderNotificationItem)}
                  </div>
                )}
              </>
            )}
          </div>

          {hasNotifications && (
            <div className="notification-footer">
              <button
                className="view-all-btn"
                onClick={() => {
                  navigate(isClientRole ? '/client/notifications' : '/notifications');
                  setIsOpen(false);
                }}
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
