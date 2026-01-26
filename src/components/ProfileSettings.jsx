import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { baseURL } from "../utils/constants";
import "./SettingsContent.css"; // Reuse existing styles

export const ProfileSettings = () => {
  const { user, profile, updateProfile, resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);

  const [settings, setSettings] = useState({
    fullName: "",
    email: "",
    twoFactorEnabled: false
  });

  const [notificationPreferences, setNotificationPreferences] = useState({
    email_approval_requests: true,
    email_post_approved: true,
    email_post_rejected: true,
    email_workspace_invites: true,
    email_new_comments: true,
    email_inbox_messages: true
  });

  // Load user profile data
  useEffect(() => {
    if (profile) {
      setSettings({
        fullName: profile.full_name || "",
        email: profile.email || user?.email || "",
        twoFactorEnabled: false
      });
    }
  }, [profile, user]);

  // Load notification preferences
  useEffect(() => {
    if (user) {
      fetchNotificationPreferences();
    }
  }, [user]);

  const fetchNotificationPreferences = async () => {
    try {
      const response = await fetch(
        `${baseURL}/api/notifications/preferences?userId=${user.id}`,
        { method: 'GET' }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setNotificationPreferences({
          email_approval_requests: data.data.preferences.email_approval_requests ?? true,
          email_post_approved: data.data.preferences.email_post_approved ?? true,
          email_post_rejected: data.data.preferences.email_post_rejected ?? true,
          email_workspace_invites: data.data.preferences.email_workspace_invites ?? true,
          email_new_comments: data.data.preferences.email_new_comments ?? true,
          email_inbox_messages: data.data.preferences.email_inbox_messages ?? true
        });
      }
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
    }
  };

  // Combined save function for profile AND notification preferences
  const handleSaveAll = async () => {
    setLoading(true);
    setSaveMessage("");

    try {
      // 1. Update user profile
      const { error: profileError } = await updateProfile({
        full_name: settings.fullName
      });

      if (profileError) {
        setSaveMessage("Error saving profile: " + profileError.message);
        setLoading(false);
        return;
      }

      // 2. Update notification preferences
      const response = await fetch(`${baseURL}/api/notifications/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          preferences: notificationPreferences
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setSaveMessage("Profile saved, but error saving notification preferences");
        setLoading(false);
        return;
      }

      setSaveMessage("Profile settings saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      setSaveMessage("Error saving settings");
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

  const handleToggleNotificationPref = (key) => {
    setNotificationPreferences({
      ...notificationPreferences,
      [key]: !notificationPreferences[key]
    });
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
              onClick={handleSaveAll}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        {/* Email Notification Preferences Section */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Email Notifications</h2>
            <p className="section-subtitle">Choose which notifications you want to receive via email</p>
          </div>
          <div className="settings-form">
            <div className="notification-item">
              <div className="notification-info">
                <h3 className="notification-title">Approval Requests</h3>
                <p className="notification-description">
                  Get notified when a post is submitted for your approval
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notificationPreferences.email_approval_requests}
                  onChange={() => handleToggleNotificationPref('email_approval_requests')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="notification-item">
              <div className="notification-info">
                <h3 className="notification-title">Post Approved</h3>
                <p className="notification-description">
                  Get notified when your post is approved by a client
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notificationPreferences.email_post_approved}
                  onChange={() => handleToggleNotificationPref('email_post_approved')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="notification-item">
              <div className="notification-info">
                <h3 className="notification-title">Post Rejected</h3>
                <p className="notification-description">
                  Get notified when your post is rejected and needs changes
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notificationPreferences.email_post_rejected}
                  onChange={() => handleToggleNotificationPref('email_post_rejected')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="notification-item">
              <div className="notification-info">
                <h3 className="notification-title">Workspace Invites</h3>
                <p className="notification-description">
                  Get notified when you're invited to join a workspace
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notificationPreferences.email_workspace_invites}
                  onChange={() => handleToggleNotificationPref('email_workspace_invites')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="notification-item">
              <div className="notification-info">
                <h3 className="notification-title">Comments & Mentions</h3>
                <p className="notification-description">
                  Get notified when someone comments on your post or mentions you
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notificationPreferences.email_new_comments}
                  onChange={() => handleToggleNotificationPref('email_new_comments')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="notification-item">
              <div className="notification-info">
                <h3 className="notification-title">Social Inbox Messages</h3>
                <p className="notification-description">
                  Get notified about new messages and mentions in your social inbox
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notificationPreferences.email_inbox_messages}
                  onChange={() => handleToggleNotificationPref('email_inbox_messages')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <p className="form-helper-text" style={{ marginTop: '12px', marginBottom: '0' }}>
              Note: You'll always receive in-app notifications regardless of these email settings.
            </p>
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
