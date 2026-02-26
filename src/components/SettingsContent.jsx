import { useState, useEffect } from "react";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useTheme } from "../contexts/ThemeContext";
import { TIMEZONES_BY_REGION, getBrowserTimezone } from "../utils/timezones";
import "./SettingsContent.css";

export const SettingsContent = () => {
  const { activeWorkspace, updateWorkspace } = useWorkspace();
  const { isDark, setLightTheme, setDarkTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [settings, setSettings] = useState({
    timezone: "UTC",
    language: "English"
  });

  // Load workspace settings
  useEffect(() => {
    if (activeWorkspace) {
      setSettings(prevSettings => ({
        // IMPORTANT: Use WORKSPACE timezone, but preserve existing value if workspace timezone is not set
        // This prevents reverting to UTC after save if there's a timing issue
        timezone: activeWorkspace?.timezone || prevSettings.timezone || "UTC",
        language: "English"
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
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Manage your preferences and workspace configuration</p>
      </div>

      <div className="settings-content">
        {/* Appearance Section - Personal preference, applies immediately */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Appearance</h2>
            <p className="section-subtitle">Customize how Woozy looks for you</p>
          </div>
          <div className="settings-form">
            <div className="form-group">
              <label className="form-label">Theme</label>
              <p className="form-helper-text">
                Choose your preferred color scheme
              </p>
              <div className="theme-toggle-buttons">
                <button
                  type="button"
                  className={`theme-option-btn ${!isDark ? 'active' : ''}`}
                  onClick={setLightTheme}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/>
                    <line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                  Light
                </button>
                <button
                  type="button"
                  className={`theme-option-btn ${isDark ? 'active' : ''}`}
                  onClick={setDarkTheme}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                  Dark
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Workspace Preferences Section */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Workspace Preferences</h2>
            <p className="section-subtitle">Settings that apply to all workspace members</p>
          </div>
          <div className="settings-form">
            <div className="form-group">
              <label className="form-label">Workspace Timezone</label>
              <p className="form-helper-text">
                All scheduled posts will use this timezone. Currently detected: {getBrowserTimezone()}
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
