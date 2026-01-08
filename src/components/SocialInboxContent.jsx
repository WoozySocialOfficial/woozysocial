import React, { useState, useEffect, useRef } from "react";
import { FaFacebookF, FaInstagram } from "react-icons/fa";
import { SiX } from "react-icons/si";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useAuth } from "../contexts/AuthContext";
import { useInbox } from "../hooks/useInbox";
import "./SocialInboxContent.css";

// Only DM-supported platforms
const PLATFORM_ICONS = {
  facebook: { icon: FaFacebookF, color: "#1877F2", name: "Facebook Messenger" },
  instagram: { icon: FaInstagram, color: "#E4405F", name: "Instagram DM" },
  twitter: { icon: SiX, color: "#000000", name: "X Direct Messages" }
};

export const SocialInboxContent = () => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const workspaceId = activeWorkspace?.id;

  // Use the inbox hook
  const {
    conversations,
    currentConversation,
    messages,
    loading,
    messagesLoading,
    sending,
    error,
    platformStats,
    totalUnread,
    selectedPlatform,
    selectConversation,
    sendMessage,
    refresh,
    filterByPlatform,
    clearError
  } = useInbox(workspaceId);

  // Local state
  const [messageFilter, setMessageFilter] = useState("all");
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Filter conversations locally
  const filteredConversations = conversations.filter(conv => {
    if (messageFilter === "unread") return conv.unread_count > 0;
    if (messageFilter === "replied") return conv.last_message_sender === "user";
    return true;
  });

  // Handle sending a reply
  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return;

    const result = await sendMessage(replyText);
    if (result.success) {
      setReplyText("");
    } else {
      alert(result.error || "Failed to send message");
    }
  };

  // Handle key press in reply textarea
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
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

  // Format message time
  const formatMessageTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Render empty state when no workspace
  if (!workspaceId) {
    return (
      <div className="social-inbox-container">
        <div className="inbox-empty-state">
          <div className="empty-icon">📭</div>
          <h2>No Workspace Selected</h2>
          <p>Please select or create a workspace to view your inbox.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="social-inbox-container">
      {/* Header */}
      <div className="inbox-header">
        <div>
          <h1 className="inbox-title">Social Inbox</h1>
          <p className="inbox-subtitle">
            Manage direct messages from Facebook, Instagram, and X
          </p>
        </div>
        <div className="inbox-header-actions">
          <button
            className="refresh-btn"
            onClick={() => refresh()}
            disabled={loading}
          >
            {loading ? "Syncing..." : "Refresh"}
          </button>
          <div className="inbox-stats">
            <div className="stat-badge">
              <span className="stat-number">{conversations.length}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat-badge unread">
              <span className="stat-number">{totalUnread}</span>
              <span className="stat-label">Unread</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="inbox-error-banner">
          <span>{error}</span>
          <button onClick={clearError}>Dismiss</button>
        </div>
      )}

      <div className="inbox-content">
        {/* Left Sidebar */}
        <div className="inbox-sidebar">
          {/* Platform Filter */}
          <div className="platform-filter-section">
            <h3 className="filter-title">Platforms</h3>
            <div className="platform-filters">
              <button
                className={`platform-filter-btn ${selectedPlatform === "all" ? "active" : ""}`}
                onClick={() => filterByPlatform("all")}
              >
                <span className="filter-icon">💬</span>
                <span className="filter-name">All Platforms</span>
                <span className="filter-count">{conversations.length}</span>
              </button>
              {Object.entries(PLATFORM_ICONS).map(([key, { icon: Icon, color, name }]) => {
                const stats = platformStats[key] || { total: 0, unread: 0 };
                return (
                  <button
                    key={key}
                    className={`platform-filter-btn ${selectedPlatform === key ? "active" : ""}`}
                    onClick={() => filterByPlatform(key)}
                  >
                    <Icon className="filter-icon" style={{ color }} />
                    <span className="filter-name">{name}</span>
                    <span className="filter-count">
                      {stats.total}
                      {stats.unread > 0 && (
                        <span className="unread-badge">{stats.unread}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message Filter */}
          <div className="message-filter-section">
            <div className="filter-tabs">
              <button
                className={`filter-tab ${messageFilter === "all" ? "active" : ""}`}
                onClick={() => setMessageFilter("all")}
              >
                All
              </button>
              <button
                className={`filter-tab ${messageFilter === "unread" ? "active" : ""}`}
                onClick={() => setMessageFilter("unread")}
              >
                Unread
              </button>
              <button
                className={`filter-tab ${messageFilter === "replied" ? "active" : ""}`}
                onClick={() => setMessageFilter("replied")}
              >
                Replied
              </button>
            </div>
          </div>

          {/* Conversations List */}
          <div className="conversations-list">
            {loading && conversations.length === 0 ? (
              <div className="loading-conversations">
                <div className="loading-spinner"></div>
                <p>Loading conversations...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="empty-conversations">
                <p>No conversations found</p>
                <span className="empty-hint">
                  {selectedPlatform !== "all"
                    ? `No ${PLATFORM_ICONS[selectedPlatform]?.name} messages yet`
                    : "Messages will appear here when you receive them"}
                </span>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const platformData = PLATFORM_ICONS[conversation.platform];
                if (!platformData) return null;
                const Icon = platformData.icon;

                return (
                  <div
                    key={conversation.id}
                    className={`conversation-item ${
                      currentConversation?.id === conversation.id ? "active" : ""
                    } ${conversation.unread_count > 0 ? "unread" : ""}`}
                    onClick={() => selectConversation(conversation)}
                  >
                    <div className="conversation-avatar">
                      {conversation.correspondent_avatar ? (
                        <img
                          src={conversation.correspondent_avatar}
                          alt={conversation.correspondent_name}
                          className="avatar-img"
                        />
                      ) : (
                        <span className="avatar-placeholder">
                          {conversation.correspondent_name?.[0]?.toUpperCase() || "?"}
                        </span>
                      )}
                      <Icon
                        className="platform-badge"
                        style={{ color: platformData.color }}
                      />
                    </div>
                    <div className="conversation-details">
                      <div className="conversation-header">
                        <span className="conversation-sender">
                          {conversation.correspondent_name || "Unknown"}
                        </span>
                        <span className="conversation-time">
                          {formatTime(conversation.last_message_at)}
                        </span>
                      </div>
                      <p className="conversation-preview">
                        {conversation.last_message_sender === "user" && (
                          <span className="you-prefix">You: </span>
                        )}
                        {conversation.last_message_text || "No messages yet"}
                      </p>
                    </div>
                    {conversation.unread_count > 0 && (
                      <div className="unread-indicator">
                        {conversation.unread_count}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side - Message Thread */}
        <div className="inbox-messages">
          {currentConversation ? (
            <>
              {/* Message Header */}
              <div className="message-thread-header">
                <div className="thread-user-info">
                  <div className="thread-avatar">
                    {currentConversation.correspondent_avatar ? (
                      <img
                        src={currentConversation.correspondent_avatar}
                        alt={currentConversation.correspondent_name}
                      />
                    ) : (
                      <span>
                        {currentConversation.correspondent_name?.[0]?.toUpperCase() || "?"}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="thread-user-name">
                      {currentConversation.correspondent_name || "Unknown"}
                    </h3>
                    <p className="thread-platform">
                      {React.createElement(
                        PLATFORM_ICONS[currentConversation.platform]?.icon || "span",
                        {
                          size: 14,
                          style: {
                            color: PLATFORM_ICONS[currentConversation.platform]?.color,
                            marginRight: "4px"
                          }
                        }
                      )}
                      {PLATFORM_ICONS[currentConversation.platform]?.name}
                      {currentConversation.correspondent_username && (
                        <span className="username">
                          @{currentConversation.correspondent_username}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {!currentConversation.can_reply && (
                  <div className="reply-warning">
                    Instagram 7-day window expired
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="message-thread">
                {messagesLoading ? (
                  <div className="loading-messages">
                    <div className="loading-spinner"></div>
                    <p>Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="no-messages">
                    <p>No messages in this conversation</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`message-bubble ${
                        message.sender_type === "user" ? "outgoing" : "incoming"
                      }`}
                    >
                      <div className="message-content">
                        <p className="message-text">{message.message_text}</p>
                        {message.media_urls?.length > 0 && (
                          <div className="message-media">
                            {message.media_urls.map((url, idx) => (
                              <img key={idx} src={url} alt="Attachment" />
                            ))}
                          </div>
                        )}
                        <span className="message-time">
                          {formatMessageTime(message.sent_at)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Input */}
              <div className="message-reply-section">
                {currentConversation.can_reply !== false ? (
                  <>
                    <textarea
                      className="reply-textarea"
                      placeholder="Type your reply..."
                      rows="3"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={sending}
                    />
                    <div className="reply-actions">
                      <span className="reply-hint">Press Enter to send</span>
                      <button
                        className="reply-btn"
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || sending}
                      >
                        {sending ? "Sending..." : "Send Reply"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="reply-disabled">
                    <p>
                      Cannot reply - Instagram conversations expire after 7 days
                      of inactivity from the contact.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-message-state">
              <div className="empty-icon">💬</div>
              <p className="empty-text">Select a conversation to view messages</p>
              <p className="empty-subtext">
                Choose a conversation from the list to start responding
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
