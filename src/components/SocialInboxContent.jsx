import React, { useState } from "react";
import "./SocialInboxContent.css";

export const SocialInboxContent = () => {
  const [messages, setMessages] = useState([]);

  return (
    <div className="social-inbox-container">
      <div className="inbox-header">
        <h1 className="inbox-title">Social Inbox</h1>
        <p className="inbox-subtitle">Monitor and respond to messages across all platforms</p>
      </div>

      <div className="messages-section">
        <div className="section-header">
          <h2 className="section-title">Messages</h2>
          <p className="section-subtitle">View and manage all your social media messages</p>
        </div>

        <div className="messages-content">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="inbox-icon">📬</div>
              <p className="empty-text">No messages yet</p>
              <p className="empty-subtext">Messages from your connected social accounts will appear here</p>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((message, index) => (
                <div key={index} className="message-item">
                  {/* Messages will be rendered here */}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
