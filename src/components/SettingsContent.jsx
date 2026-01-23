import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { TIMEZONES_BY_REGION, getBrowserTimezone } from "../utils/timezones";
import "./SettingsContent.css";

export const SettingsContent = () => {
  const { user, profile, updateProfile, resetPassword } = useAuth();
  const { activeWorkspace, updateWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);

  const [settings, setSettings] = useState({
    fullName: "",
    email: "",
    timezone: "UTC",
    language: "English",
    theme: "Light",
    twoFactorEnabled: false,
    emailNotifications: true,
    weeklySummaries: true,
    teamActivityAlerts: true
  });

  // Load user profile data and workspace settings
  useEffect(() => {
    if (profile) {
      setSettings(prevSettings => ({
        fullName: profile.full_name || "",
        email: profile.email || user?.email || "",
        // IMPORTANT: Use WORKSPACE timezone, but preserve existing value if workspace timezone is not set
        // This prevents reverting to UTC after save if there's a timing issue
        timezone: activeWorkspace?.timezone || prevSettings.timezone || "UTC",
        language: "English",
        theme: "Light",
        twoFactorEnabled: false,
        emailNotifications: profile.email_notifications ?? true,
        weeklySummaries: profile.weekly_summaries ?? true,
        teamActivityAlerts: profile.team_activity_alerts ?? true
      }));
    }
  }, [profile, user, activeWorkspace]);

  const handleSaveProfile = async () => {
    setLoading(true);
    setSaveMessage("");

    // Store the timezone being saved to ensure UI stays consistent
    const savedTimezone = settings.timezone;

    try {
      // Update user profile (personal settings)
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

      // Update workspace timezone (workspace-level setting)
      if (activeWorkspace) {
        const { error: workspaceError } = await updateWorkspace(activeWorkspace.id, {
          timezone: savedTimezone
        });

        if (workspaceError) {
          setSaveMessage("Error saving timezone: " + workspaceError.message);
          setLoading(false);
          return;
        }
      }

      setSaveMessage("Settings saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);

      // Note: updateWorkspace() will refresh activeWorkspace in the background
      // The timezone is already correct in settings.timezone (savedTimezone)
      // so the UI will stay on the saved value
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

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Manage your account preferences and configuration</p>
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

        {/* Preferences Section */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Preferences</h2>
            <p className="section-subtitle">Customize your experience</p>
          </div>
          <div className="settings-form">
            <div className="form-group">
              <label className="form-label">Workspace Timezone</label>
              <p className="form-helper-text">
                Set the timezone for this workspace. All scheduled posts will use this timezone. Currently detected: {getBrowserTimezone()}
              </p>
              <select
                className="form-select"
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              >
                {Object.entries(TIMEZONES_BY_REGION).map(([region, timezones]) => (
                  <optgroup key={region} label={region}>
                    {timezones.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label} (GMT{tz.offset})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
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
