import React, { useState } from "react";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaReddit, FaTelegram, FaPinterest } from "react-icons/fa";
import { FaTiktok, FaThreads, FaBluesky } from "react-icons/fa6";
import { SiX, SiGooglemybusiness } from "react-icons/si";
import "./SocialInboxContent.css";

const PLATFORM_ICONS = {
  facebook: { icon: FaFacebookF, color: "#1877F2", name: "Facebook" },
  instagram: { icon: FaInstagram, color: "#E4405F", name: "Instagram" },
  twitter: { icon: SiX, color: "#000000", name: "Twitter/X" },
  linkedin: { icon: FaLinkedinIn, color: "#0A66C2", name: "LinkedIn" },
  tiktok: { icon: FaTiktok, color: "#000000", name: "TikTok" },
  youtube: { icon: FaYoutube, color: "#FF0000", name: "YouTube" },
  threads: { icon: FaThreads, color: "#000000", name: "Threads" },
  telegram: { icon: FaTelegram, color: "#0088cc", name: "Telegram" },
  pinterest: { icon: FaPinterest, color: "#BD081C", name: "Pinterest" },
  reddit: { icon: FaReddit, color: "#FF4500", name: "Reddit" },
  bluesky: { icon: FaBluesky, color: "#1185FE", name: "BlueSky" },
  googleBusiness: { icon: SiGooglemybusiness, color: "#4285F4", name: "Google Business" }
};

export const SocialInboxContent = () => {
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messageFilter, setMessageFilter] = useState("all"); // all, unread, replied

  // Mock data - will be replaced with actual API calls
  const [conversations] = useState([
    {
      id: 1,
      platform: "facebook",
      sender: "John Doe",
      avatar: "👤",
      lastMessage: "Hey, I loved your recent post about social media marketing!",
      timestamp: "2 hours ago",
      unread: true,
      messages: [
        { id: 1, sender: "John Doe", text: "Hey, I loved your recent post about social media marketing!", time: "2:30 PM", incoming: true },
        { id: 2, sender: "You", text: "Thank you so much! I'm glad you found it helpful.", time: "2:35 PM", incoming: false }
      ]
    },
    {
      id: 2,
      platform: "instagram",
      sender: "Sarah Smith",
      avatar: "👤",
      lastMessage: "Can you share more details about your services?",
      timestamp: "5 hours ago",
      unread: true,
      messages: [
        { id: 1, sender: "Sarah Smith", text: "Can you share more details about your services?", time: "11:00 AM", incoming: true }
      ]
    },
    {
      id: 3,
      platform: "twitter",
      sender: "Mike Johnson",
      avatar: "👤",
      lastMessage: "Thanks for the quick response!",
      timestamp: "1 day ago",
      unread: false,
      messages: [
        { id: 1, sender: "Mike Johnson", text: "Is this service available worldwide?", time: "Yesterday 3:00 PM", incoming: true },
        { id: 2, sender: "You", text: "Yes, we serve clients globally!", time: "Yesterday 3:15 PM", incoming: false },
        { id: 3, sender: "Mike Johnson", text: "Thanks for the quick response!", time: "Yesterday 3:20 PM", incoming: true }
      ]
    },
    {
      id: 4,
      platform: "linkedin",
      sender: "Emily Brown",
      avatar: "👤",
      lastMessage: "I'd like to connect and discuss potential collaboration.",
      timestamp: "2 days ago",
      unread: false,
      messages: [
        { id: 1, sender: "Emily Brown", text: "I'd like to connect and discuss potential collaboration.", time: "2 days ago", incoming: true },
        { id: 2, sender: "You", text: "Sure! Let's schedule a call next week.", time: "2 days ago", incoming: false }
      ]
    }
  ]);

  const filteredConversations = conversations.filter(conv => {
    const platformMatch = selectedPlatform === "all" || conv.platform === selectedPlatform;
    const filterMatch =
      messageFilter === "all" ||
      (messageFilter === "unread" && conv.unread) ||
      (messageFilter === "replied" && !conv.unread);
    return platformMatch && filterMatch;
  });

  const unreadCount = conversations.filter(c => c.unread).length;

  return (
    <div className="social-inbox-container">
      <div className="inbox-header">
        <div>
          <h1 className="inbox-title">Social Inbox</h1>
          <p className="inbox-subtitle">Monitor and respond to messages across all platforms</p>
        </div>
        <div className="inbox-stats">
          <div className="stat-badge">
            <span className="stat-number">{conversations.length}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat-badge unread">
            <span className="stat-number">{unreadCount}</span>
            <span className="stat-label">Unread</span>
          </div>
        </div>
      </div>

      <div className="inbox-content">
        {/* Left Sidebar - Platform Filters & Conversations */}
        <div className="inbox-sidebar">
          {/* Platform Filter */}
          <div className="platform-filter-section">
            <h3 className="filter-title">Platforms</h3>
            <div className="platform-filters">
              <button
                className={`platform-filter-btn ${selectedPlatform === "all" ? "active" : ""}`}
                onClick={() => setSelectedPlatform("all")}
              >
                <span className="filter-icon">📱</span>
                <span className="filter-name">All Platforms</span>
                <span className="filter-count">{conversations.length}</span>
              </button>
              {Object.entries(PLATFORM_ICONS).map(([key, { icon: Icon, color, name }]) => {
                const count = conversations.filter(c => c.platform === key).length;
                if (count === 0) return null;
                return (
                  <button
                    key={key}
                    className={`platform-filter-btn ${selectedPlatform === key ? "active" : ""}`}
                    onClick={() => setSelectedPlatform(key)}
                  >
                    <Icon className="filter-icon" style={{ color }} />
                    <span className="filter-name">{name}</span>
                    <span className="filter-count">{count}</span>
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
            {filteredConversations.length === 0 ? (
              <div className="empty-conversations">
                <p>No conversations found</p>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const platformData = PLATFORM_ICONS[conversation.platform];
                const Icon = platformData.icon;
                return (
                  <div
                    key={conversation.id}
                    className={`conversation-item ${selectedConversation?.id === conversation.id ? "active" : ""} ${conversation.unread ? "unread" : ""}`}
                    onClick={() => setSelectedConversation(conversation)}
                  >
                    <div className="conversation-avatar">
                      {conversation.avatar}
                      <Icon className="platform-badge" style={{ color: platformData.color }} />
                    </div>
                    <div className="conversation-details">
                      <div className="conversation-header">
                        <span className="conversation-sender">{conversation.sender}</span>
                        <span className="conversation-time">{conversation.timestamp}</span>
                      </div>
                      <p className="conversation-preview">{conversation.lastMessage}</p>
                    </div>
                    {conversation.unread && <div className="unread-indicator"></div>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side - Message Thread */}
        <div className="inbox-messages">
          {selectedConversation ? (
            <>
              {/* Message Header */}
              <div className="message-thread-header">
                <div className="thread-user-info">
                  <div className="thread-avatar">{selectedConversation.avatar}</div>
                  <div>
                    <h3 className="thread-user-name">{selectedConversation.sender}</h3>
                    <p className="thread-platform">
                      {React.createElement(PLATFORM_ICONS[selectedConversation.platform].icon, {
                        size: 14,
                        style: { color: PLATFORM_ICONS[selectedConversation.platform].color, marginRight: "4px" }
                      })}
                      {PLATFORM_ICONS[selectedConversation.platform].name}
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="message-thread">
                {selectedConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-bubble ${message.incoming ? "incoming" : "outgoing"}`}
                  >
                    <div className="message-content">
                      <p className="message-text">{message.text}</p>
                      <span className="message-time">{message.time}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply Input */}
              <div className="message-reply-section">
                <textarea
                  className="reply-textarea"
                  placeholder="Type your reply..."
                  rows="3"
                />
                <div className="reply-actions">
                  <button className="reply-btn">Send Reply</button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-message-state">
              <div className="empty-icon">💬</div>
              <p className="empty-text">Select a conversation to view messages</p>
              <p className="empty-subtext">Choose a conversation from the list to start responding</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
