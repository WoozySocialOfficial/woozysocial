import React, { useState } from "react";
import "./SocialsContent.css";

export const SocialsContent = () => {
  const [socialAccounts] = useState([
    { name: "Instagram", icon: "📷", connected: false, color: "#E4405F" },
    { name: "Facebook", icon: "📘", connected: false, color: "#1877F2" },
    { name: "Twitter", icon: "🐦", connected: false, color: "#1DA1F2" },
    { name: "LinkedIn", icon: "💼", connected: false, color: "#0A66C2" },
    { name: "YouTube", icon: "📺", connected: false, color: "#FF0000" },
    { name: "TikTok", icon: "🎵", connected: false, color: "#000000" }
  ]);

  const handleConnect = (platformName) => {
    // TODO: Implement OAuth connection flow
  };

  return (
    <div className="socials-container">
      <div className="socials-header">
        <h1 className="socials-title">Socials</h1>
        <p className="socials-subtitle">Connect and manage your social media accounts</p>
      </div>

      <div className="accounts-section">
        <div className="section-header">
          <h2 className="section-title">Connected Accounts</h2>
          <p className="section-subtitle">Link your social media platforms to start posting</p>
        </div>

        <div className="accounts-grid">
          {socialAccounts.map((account, index) => (
            <div key={index} className="account-card">
              <div className="account-info">
                <div className="account-icon" style={{ backgroundColor: account.color }}>
                  {account.icon}
                </div>
                <div className="account-details">
                  <h3 className="account-name">{account.name}</h3>
                  <p className="account-status">
                    {account.connected ? "Connected" : "Not connected"}
                  </p>
                </div>
              </div>
              <button
                className={`connect-button ${account.connected ? "connected" : ""}`}
                onClick={() => handleConnect(account.name)}
              >
                {account.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
