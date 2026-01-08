import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { TIMEZONES_BY_REGION, getBrowserTimezone } from "../utils/timezones";
import { supabase } from "../utils/supabaseClient";
import "./SettingsContent.css";

export const SettingsContent = () => {
  const { user, profile, updateProfile, resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const fileInputRef = useRef(null);

  const [settings, setSettings] = useState({
    fullName: "",
    email: "",
    timezone: "UTC",
    logoUrl: "",
    language: "English",
    theme: "Light",
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
        timezone: profile.timezone || getBrowserTimezone() || "UTC",
        logoUrl: profile.logo_url || "",
        language: "English",
        theme: "Light",
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
      const { error } = await updateProfile({
        full_name: settings.fullName,
        timezone: settings.timezone,
        email_notifications: settings.emailNotifications,
        weekly_summaries: settings.weeklySummaries,
        team_activity_alerts: settings.teamActivityAlerts,
      });

      if (error) {
        setSaveMessage("Error saving profile: " + error.message);
      } else {
        setSaveMessage("Profile saved successfully!");
        setTimeout(() => setSaveMessage(""), 3000);
      }
    } catch (error) {
      setSaveMessage("Error saving profile");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setSaveMessage("Please upload an image file (PNG, JPG, SVG)");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setSaveMessage("Logo must be less than 2MB");
      return;
    }

    setLogoUploading(true);
    setSaveMessage("");

    try {
      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('user-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('user-assets')
        .getPublicUrl(filePath);

      const logoUrl = urlData.publicUrl;

      // Update profile with logo URL
      const { error: updateError } = await updateProfile({
        logo_url: logoUrl
      });

      if (updateError) throw updateError;

      // Update local state
      setSettings({ ...settings, logoUrl });
      setSaveMessage("Logo uploaded successfully!");
      setTimeout(() => setSaveMessage(""), 3000);

    } catch (error) {
      console.error('Logo upload error:', error);
      setSaveMessage("Error uploading logo: " + error.message);
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    setLogoUploading(true);
    setSaveMessage("");

    try {
      const { error } = await updateProfile({
        logo_url: null
      });

      if (error) throw error;

      setSettings({ ...settings, logoUrl: "" });
      setSaveMessage("Logo removed successfully!");
      setTimeout(() => setSaveMessage(""), 3000);

    } catch (error) {
      setSaveMessage("Error removing logo: " + error.message);
    } finally {
      setLogoUploading(false);
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
        {/* Company Logo Section - Full Width */}
        <div className="settings-section full-width">
          <div className="section-header">
            <h2 className="section-title">Company Logo</h2>
            <p className="section-subtitle">Upload your company or personal logo</p>
          </div>
          <div className="logo-upload-section">
            <div className="logo-preview-container">
              <div className="logo-preview">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Company Logo" />
                ) : (
                  <div className="logo-preview-placeholder">[LOGO]</div>
                )}
              </div>
            </div>
            <div className="logo-upload-controls">
              <div className="file-input-wrapper">
                <label htmlFor="logo-upload" className="file-input-label">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  {logoUploading ? 'Uploading...' : 'Upload Logo'}
                </label>
                <input
                  id="logo-upload"
                  ref={fileInputRef}
                  type="file"
                  className="file-input"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={logoUploading}
                />
              </div>
              {settings.logoUrl && (
                <button
                  className="remove-logo-button"
                  onClick={handleRemoveLogo}
                  disabled={logoUploading}
                >
                  Remove Logo
                </button>
              )}
              <div className="logo-info">
                <p>
                  <strong>Recommended:</strong> Square image (1:1 ratio), PNG or SVG format
                  <br />
                  <strong>Maximum size:</strong> 2MB
                  <br />
                  <strong>Note:</strong> This logo will appear in the top left corner of your dashboard
                </p>
              </div>
            </div>
          </div>
        </div>

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
              <label className="form-label">Timezone</label>
              <p className="form-helper-text">
                Choose your timezone for accurate post scheduling. Currently detected: {getBrowserTimezone()}
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
