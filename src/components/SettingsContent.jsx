import React, { useState } from "react";
import "./SettingsContent.css";

export const SettingsContent = () => {
  const [settings, setSettings] = useState({
    fullName: "John Doe",
    email: "john@example.com",
    language: "English",
    theme: "Light",
    twoFactorEnabled: false
  });

  const handleSaveProfile = () => {
    console.log("Save profile clicked");
    // TODO: Implement save profile functionality
  };

  const handleChangePassword = () => {
    console.log("Change password clicked");
    // TODO: Implement change password functionality
  };

  const handleToggle2FA = () => {
    setSettings({ ...settings, twoFactorEnabled: !settings.twoFactorEnabled });
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Manage your account preferences and security</p>
      </div>

      <div className="settings-content">
        {/* Profile Section */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Profile</h2>
            <p className="section-subtitle">Update your personal information</p>
          </div>
          <div className="settings-form">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                value={settings.fullName}
                onChange={(e) => setSettings({ ...settings, fullName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
              />
            </div>
            <button className="save-button" onClick={handleSaveProfile}>
              Save Profile
            </button>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Preferences</h2>
            <p className="section-subtitle">Customize your experience</p>
          </div>
          <div className="settings-form">
            <div className="form-group">
              <label className="form-label">Language</label>
              <select
                className="form-select"
                value={settings.language}
                onChange={(e) => setSettings({ ...settings, language: e.target.value })}
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Theme</label>
              <select
                className="form-select"
                value={settings.theme}
                onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
              >
                <option value="Light">Light</option>
                <option value="Dark">Dark</option>
                <option value="Auto">Auto</option>
              </select>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Security</h2>
            <p className="section-subtitle">Protect your account</p>
          </div>
          <div className="settings-form">
            <div className="security-item">
              <div>
                <h3 className="security-item-title">Change Password</h3>
                <p className="security-item-text">Update your password regularly</p>
              </div>
              <button className="security-button" onClick={handleChangePassword}>
                Change Password
              </button>
            </div>
            <div className="security-item">
              <div>
                <h3 className="security-item-title">Two-Factor Authentication</h3>
                <p className="security-item-text">
                  {settings.twoFactorEnabled ? "Enabled" : "Add an extra layer of security"}
                </p>
              </div>
              <button
                className={`security-button ${settings.twoFactorEnabled ? "enabled" : ""}`}
                onClick={handleToggle2FA}
              >
                {settings.twoFactorEnabled ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        </div>

        {/* API & Integrations Section */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">API & Integrations</h2>
            <p className="section-subtitle">Manage your API keys and integrations</p>
          </div>
          <div className="settings-form">
            <div className="api-info-box">
              <p className="api-info-text">No API keys configured</p>
              <button className="api-button">Generate API Key</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
