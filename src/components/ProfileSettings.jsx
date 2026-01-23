import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import "./SettingsContent.css"; // Reuse existing styles

export const ProfileSettings = () => {
  const { user, profile, updateProfile, resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);

  const [settings, setSettings] = useState({
    fullName: "",
    email: "",
    twoFactorEnabled: false,
    emailNotifications: true,
    weeklySummaries: true,
    teamActivityAlerts: true
  });

  // Load user profile data
  useEffect(() => {
    if (profile) {
      setSettings({
        fullName: profile.full_name || "",
        email: profile.email || user?.email || "",
        twoFactorEnabled: false,
        emailNotifications: profile.email_notifications ?? true,
        weeklySummaries: profile.weekly_summaries ?? true,
        teamActivityAlerts: profile.team_activity_alerts ?? true
      });
    }
  }, [profile, user]);

  const handleSaveProfile = async () => {
    setLoading(true);
    setSaveMessage("");

    try {
      // Update user profile (personal settings only)
      const { error: profileError } = await updateProfile({
        full_name: settings.fullName,
        email_notifications: settings.emailNotifications,
        weekly_summaries: settings.weeklySummaries,
        team_activity_alerts: settings.teamActivityAlerts,
      });

      if (profileError) {
        setSaveMessage("Error saving profile: " + profileError.message);
        setLoading(false);
        return;
      }

      setSaveMessage("Profile saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      setSaveMessage("Error saving profile");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    const userEmail = user?.email || settings.email;
    if (!userEmail) {
      setSaveMessage("Error: No email address found");
      return;
    }

    setPasswordResetLoading(true);
    setSaveMessage("");

    try {
      const { error } = await resetPassword(userEmail);
      if (error) {
        setSaveMessage("Error sending reset link: " + error.message);
      } else {
        setSaveMessage("Password reset link sent to " + userEmail);
        setTimeout(() => setSaveMessage(""), 5000);
      }
    } catch (error) {
      setSaveMessage("Error sending reset link");
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const handleToggle2FA = () => {
    setSettings({ ...settings, twoFactorEnabled: !settings.twoFactorEnabled });
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1 className="settings-title">Profile Settings</h1>
        <p className="settings-subtitle">Manage your personal information and preferences</p>
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
                placeholder="Enter your full name"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input form-input-readonly"
                value={settings.email}
                readOnly
                disabled
              />
              <p className="form-helper-text">
                Email cannot be changed. Contact support if needed.
              </p>
            </div>
            {saveMessage && (
              <div className={`save-message ${saveMessage.includes('Error') ? 'error' : 'success'}`}>
                {saveMessage}
              </div>
            )}
            <button
              className="save-button"
              onClick={handleSaveProfile}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Notifications</h2>
            <p className="section-subtitle">Manage how you receive updates</p>
          </div>
          <div className="settings-form">
            <div className="notification-item">
              <div className="notification-info">
                <h3 className="notification-title">Email Notifications</h3>
                <p className="notification-description">
                  Receive email alerts for important updates and activities
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.emailNotifications}
                  onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="notification-item">
              <div className="notification-info">
                <h3 className="notification-title">Weekly Summaries</h3>
                <p className="notification-description">
                  Get a weekly summary of your social media performance and scheduled posts
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.weeklySummaries}
                  onChange={(e) => setSettings({ ...settings, weeklySummaries: e.target.checked })}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="notification-item">
              <div className="notification-info">
                <h3 className="notification-title">Team Activity Alerts</h3>
                <p className="notification-description">
                  Stay informed when team members create, edit, or publish posts
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.teamActivityAlerts}
                  onChange={(e) => setSettings({ ...settings, teamActivityAlerts: e.target.checked })}
                />
                <span className="toggle-slider"></span>
              </label>
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
              <button
                className="security-button"
                onClick={handleChangePassword}
                disabled={passwordResetLoading}
              >
                {passwordResetLoading ? "Sending..." : "Change Password"}
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
      </div>
    </div>
  );
};
