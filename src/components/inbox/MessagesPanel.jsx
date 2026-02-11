import React, { useState, useEffect, useRef } from "react";
import { FaFacebookF, FaInstagram } from "react-icons/fa";
import { SiX } from "react-icons/si";
import { LoadingContainer } from "../ui/LoadingSpinner";

const PLATFORM_ICONS = {
  facebook: { icon: FaFacebookF, color: "#1877F2", name: "Facebook Messenger" },
  instagram: { icon: FaInstagram, color: "#E4405F", name: "Instagram DM" },
  twitter: { icon: SiX, color: "#000000", name: "X Direct Messages" }
};

export const MessagesPanel = ({ inboxData }) => {
  const {
    conversations,
    currentConversation,
    messages,
    loading,
    messagesLoading,
    sending,
    error,
    syncErrors = {},
    platformStats,
    selectedPlatform,
    selectConversation,
    sendMessage,
    filterByPlatform,
    refresh,
    clearError
  } = inboxData;

  const hasSyncErrors = Object.keys(syncErrors).length > 0;

  const [messageFilter, setMessageFilter] = useState("all");
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const filteredConversations = conversations.filter(conv => {
    if (messageFilter === "unread") return conv.unread_count > 0;
    if (messageFilter === "replied") return conv.last_message_sender === "user";
    return true;
  });

  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return;

    const result = await sendMessage(replyText);
    if (result.success) {
      setReplyText("");
    } else {
      alert(result.error || "Failed to send message");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

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

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      {error && (
        <div className="mp-error-banner">
          <span>{error}</span>
          <div className="mp-error-actions">
            <button className="mp-error-retry" onClick={() => refresh()}>Retry</button>
            <button className="mp-error-dismiss" onClick={clearError}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="unified-inbox-grid">
        {/* Left Sidebar */}
        <div className="mp-sidebar">
          {/* Platform Filter */}
          <div className="mp-platform-section">
            <h3 className="mp-filter-title">Platforms</h3>
            <div className="mp-platform-filters">
              <button
                className={`mp-platform-btn ${selectedPlatform === "all" ? "active" : ""}`}
                onClick={() => filterByPlatform("all")}
              >
                <span className="mp-filter-icon">💬</span>
                <span className="mp-filter-name">All Platforms</span>
                <span className="mp-filter-count">{conversations.length}</span>
              </button>
              {Object.entries(PLATFORM_ICONS).map(([key, { icon: Icon, color, name }]) => {
                const stats = platformStats[key] || { total: 0, unread: 0 };
                const hasError = !!syncErrors[key];
                return (
                  <button
                    key={key}
                    className={`mp-platform-btn ${selectedPlatform === key ? "active" : ""} ${hasError ? "has-error" : ""}`}
                    onClick={() => filterByPlatform(key)}
                    title={hasError ? syncErrors[key] : ""}
                  >
                    <Icon className="mp-filter-icon" style={{ color: hasError ? "#999" : color }} />
                    <span className="mp-filter-name">{name}</span>
                    <span className="mp-filter-count">
                      {hasError ? (
                        <span className="mp-platform-error-dot" title="Connection issue">!</span>
                      ) : (
                        <>
                          {stats.total}
                          {stats.unread > 0 && (
                            <span className="mp-unread-badge">{stats.unread}</span>
                          )}
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message Filter */}
          <div className="mp-message-filter">
            <div className="mp-filter-tabs">
              <button
                className={`mp-filter-tab ${messageFilter === "all" ? "active" : ""}`}
                onClick={() => setMessageFilter("all")}
              >
                All
              </button>
              <button
                className={`mp-filter-tab ${messageFilter === "unread" ? "active" : ""}`}
                onClick={() => setMessageFilter("unread")}
              >
                Unread
              </button>
              <button
                className={`mp-filter-tab ${messageFilter === "replied" ? "active" : ""}`}
                onClick={() => setMessageFilter("replied")}
              >
                Replied
              </button>
            </div>
          </div>

          {/* Conversations List */}
          <div className="mp-conversations-list">
            {loading && conversations.length === 0 ? (
              <LoadingContainer message="Loading conversations..." size="sm" />
            ) : filteredConversations.length === 0 ? (
              <div className="mp-empty-conversations">
                <div className="mp-empty-icon">💬</div>
                <p>No conversations found</p>
                <span className="mp-empty-hint">
                  {selectedPlatform !== "all"
                    ? `No ${PLATFORM_ICONS[selectedPlatform]?.name} messages yet`
                    : "Connect your social accounts and sync to see direct messages"}
                </span>
                <button
                  className="mp-sync-btn"
                  onClick={() => refresh()}
                  disabled={loading}
                >
                  {loading ? "Syncing..." : "Sync Messages"}
                </button>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const platformData = PLATFORM_ICONS[conversation.platform];
                if (!platformData) return null;
                const Icon = platformData.icon;

                return (
                  <div
                    key={conversation.id}
                    className={`mp-conversation-item ${
                      currentConversation?.id === conversation.id ? "active" : ""
                    } ${conversation.unread_count > 0 ? "unread" : ""}`}
                    onClick={() => selectConversation(conversation)}
                  >
                    <div className="mp-avatar">
                      {conversation.correspondent_avatar ? (
                        <img
                          src={conversation.correspondent_avatar}
                          alt={conversation.correspondent_name}
                          className="mp-avatar-img"
                        />
                      ) : (
                        <span className="mp-avatar-placeholder">
                          {conversation.correspondent_name?.[0]?.toUpperCase() || "?"}
                        </span>
                      )}
                      <Icon
                        className="mp-avatar-badge"
                        style={{ color: platformData.color }}
                      />
                    </div>
                    <div className="mp-conversation-details">
                      <div className="mp-conversation-header">
                        <span className="mp-sender">
                          {conversation.correspondent_name || "Unknown"}
                        </span>
                        <span className="mp-time">
                          {formatTime(conversation.last_message_at)}
                        </span>
                      </div>
                      <p className="mp-preview">
                        {conversation.last_message_sender === "user" && (
                          <span className="mp-you-prefix">You: </span>
                        )}
                        {conversation.last_message_text || "No messages yet"}
                      </p>
                    </div>
                    {conversation.unread_count > 0 && (
                      <div className="mp-unread-indicator">
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
        <div className="mp-messages">
          {currentConversation ? (
            <>
              <div className="mp-thread-header">
                <div className="mp-thread-user-info">
                  <div className="mp-thread-avatar">
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
                    <h3 className="mp-thread-name">
                      {currentConversation.correspondent_name || "Unknown"}
                    </h3>
                    <p className="mp-thread-platform">
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
                        <span className="mp-username">
                          @{currentConversation.correspondent_username}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {!currentConversation.can_reply && (
                  <div className="mp-reply-warning">
                    Instagram 7-day window expired
                  </div>
                )}
              </div>

              <div className="mp-thread">
                {messagesLoading ? (
                  <LoadingContainer message="Loading messages..." size="sm" />
                ) : messages.length === 0 ? (
                  <div className="mp-no-messages">
                    <p>No messages in this conversation</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`mp-bubble ${
                        message.sender_type === "user" ? "outgoing" : "incoming"
                      }`}
                    >
                      <div className="mp-bubble-content">
                        <p className="mp-bubble-text">{message.message_text}</p>
                        {message.media_urls?.length > 0 && (
                          <div className="mp-media">
                            {message.media_urls.map((url, idx) => (
                              <img key={idx} src={url} alt="Attachment" />
                            ))}
                          </div>
                        )}
                        <span className="mp-bubble-time">
                          {formatMessageTime(message.sent_at)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="mp-reply-section">
                {currentConversation.can_reply !== false ? (
                  <>
                    <textarea
                      className="mp-reply-textarea"
                      placeholder="Type your reply..."
                      rows="3"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={sending}
                    />
                    <div className="mp-reply-actions">
                      <span className="mp-reply-hint">Press Enter to send</span>
                      <button
                        className="mp-send-btn"
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || sending}
                      >
                        {sending ? "Sending..." : "Send Reply"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mp-reply-disabled">
                    <p>
                      Cannot reply - Instagram conversations expire after 7 days
                      of inactivity from the contact.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="unified-empty-state">
              <div className="empty-icon">💬</div>
              {conversations.length > 0 ? (
                <>
                  <p className="empty-text">Select a conversation to view messages</p>
                  <p className="empty-subtext">
                    Choose a conversation from the list to start responding
                  </p>
                </>
              ) : hasSyncErrors ? (
                <>
                  <p className="empty-text">Platform connection issues</p>
                  <div className="mp-sync-errors">
                    {Object.entries(syncErrors).map(([platform, errorMsg]) => {
                      const platformInfo = PLATFORM_ICONS[platform];
                      if (!platformInfo) return null;
                      const Icon = platformInfo.icon;
                      const isNotLinked = errorMsg.toLowerCase().includes("not linked");
                      const needsRelink = errorMsg.toLowerCase().includes("relinked");
                      return (
                        <div key={platform} className="mp-sync-error-item">
                          <Icon style={{ color: platformInfo.color, flexShrink: 0 }} />
                          <div className="mp-sync-error-detail">
                            <strong>{platformInfo.name}</strong>
                            <span>
                              {isNotLinked
                                ? "Not connected. Link this account in Social Accounts settings."
                                : needsRelink
                                ? "Needs to be unlinked and relinked to enable messaging."
                                : errorMsg}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="mp-sync-btn"
                    onClick={() => refresh()}
                    disabled={loading}
                    style={{ marginTop: "16px" }}
                  >
                    {loading ? "Checking..." : "Retry Sync"}
                  </button>
                </>
              ) : (
                <>
                  <p className="empty-text">No direct messages yet</p>
                  <p className="empty-subtext">
                    Messages from Facebook Messenger, Instagram DMs, and X will appear here.
                    Make sure your social accounts are connected and have messaging enabled.
                  </p>
                  <button
                    className="mp-sync-btn"
                    onClick={() => refresh()}
                    disabled={loading}
                    style={{ marginTop: "16px" }}
                  >
                    {loading ? "Syncing..." : "Sync Messages"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
