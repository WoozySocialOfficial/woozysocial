import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { TIMEZONES_BY_REGION, getBrowserTimezone } from "../utils/timezones";
import "./SettingsContent.css";

export const SettingsContent = () => {
  const { user } = useAuth();
  const { activeWorkspace, updateWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [settings, setSettings] = useState({
    timezone: "UTC",
    language: "English",
    theme: "Light"
  });

  // Load workspace settings
  useEffect(() => {
    if (activeWorkspace) {
      setSettings(prevSettings => ({
        // IMPORTANT: Use WORKSPACE timezone, but preserve existing value if workspace timezone is not set
        // This prevents reverting to UTC after save if there's a timing issue
        timezone: activeWorkspace?.timezone || prevSettings.timezone || "UTC",
        language: "English",
        theme: "Light"
      }));
    }
  }, [activeWorkspace]);

  const handleSaveWorkspace = async () => {
    setLoading(true);
    setSaveMessage("");

    // Store the timezone being saved to ensure UI stays consistent
    const savedTimezone = settings.timezone;

    try {
      // Update workspace settings
      if (activeWorkspace) {
        const { error: workspaceError } = await updateWorkspace(activeWorkspace.id, {
          timezone: savedTimezone
        });

        if (workspaceError) {
          setSaveMessage("Error saving workspace settings: " + workspaceError.message);
          setLoading(false);
          return;
        }
      }

      setSaveMessage("Workspace settings saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);

      // Note: updateWorkspace() will refresh activeWorkspace in the background
      // The timezone is already correct in settings.timezone (savedTimezone)
      // so the UI will stay on the saved value
    } catch (error) {
      setSaveMessage("Error saving workspace settings");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1 className="settings-title">Workspace Settings</h1>
        <p className="settings-subtitle">Manage workspace preferences and configuration</p>
      </div>

      <div className="settings-content">
        {/* Workspace Preferences Section */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Workspace Preferences</h2>
            <p className="section-subtitle">Customize workspace settings for all members</p>
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
              <p className="form-helper-text">
                Default language for this workspace
              </p>
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
              <p className="form-helper-text">
                Default theme for this workspace
              </p>
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
            {saveMessage && (
              <div className={`save-message ${saveMessage.includes('Error') ? 'error' : 'success'}`}>
                {saveMessage}
              </div>
            )}
            <button
              className="save-button"
              onClick={handleSaveWorkspace}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Workspace Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
