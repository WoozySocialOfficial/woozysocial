import React, { useState, useEffect } from 'react';
import { FaLink, FaListUl, FaInstagram, FaChevronDown, FaChevronUp, FaCog } from 'react-icons/fa';
import './PostSettings.css';

/**
 * PostSettings Component
 *
 * Provides advanced posting options for different social media platforms:
 * - Auto-shorten links (Ayrshare feature)
 * - Thread posts for Twitter/X
 * - Instagram post type selector (Story/Reel/Feed)
 */
export const PostSettings = ({
  selectedPlatforms = [],
  settings = {},
  onSettingsChange,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Normalize platform names (handle twitter/x/x/twitter variations)
  const normalizedPlatforms = selectedPlatforms.map(p => p.toLowerCase());
  const hasTwitter = normalizedPlatforms.some(p =>
    ['twitter', 'x', 'x/twitter'].includes(p)
  );
  const hasInstagram = normalizedPlatforms.includes('instagram');

  // Settings state
  const [shortenLinks, setShortenLinks] = useState(settings.shortenLinks || false);
  const [threadPost, setThreadPost] = useState(settings.threadPost || false);
  const [threadNumber, setThreadNumber] = useState(settings.threadNumber !== false);
  const [instagramType, setInstagramType] = useState(settings.instagramType || 'feed');

  // Update parent when settings change
  const handleSettingChange = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    onSettingsChange?.(newSettings);
  };

  // Show/hide based on whether any platform-specific options are available
  const hasAnyOptions = hasTwitter || hasInstagram;

  // If no options available, don't render
  if (!hasAnyOptions && selectedPlatforms.length > 0) {
    return null;
  }

  return (
    <div className={`post-settings ${className}`}>
      <button
        type="button"
        className="post-settings-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="post-settings-content"
      >
        <span className="post-settings-toggle-label">
          <FaCog className="post-settings-icon" />
          <span>Post Settings</span>
        </span>
        {isExpanded ? <FaChevronUp size={14} /> : <FaChevronDown size={14} />}
      </button>

      {isExpanded && (
        <div className="post-settings-content" id="post-settings-content">
          {/* Auto-Shorten Links (All Platforms) */}
          <div className="setting-item">
            <label className="setting-label">
              <input
                type="checkbox"
                checked={shortenLinks}
                onChange={(e) => {
                  setShortenLinks(e.target.checked);
                  handleSettingChange('shortenLinks', e.target.checked);
                }}
                className="setting-checkbox"
              />
              <FaLink className="setting-icon" />
              <span>Auto-Shorten Links</span>
            </label>
            <p className="setting-description">
              Automatically shorten URLs in your post (Ayrshare feature)
            </p>
          </div>

          {/* Thread Post Toggle (Twitter/X only) */}
          {hasTwitter && (
            <div className="setting-item setting-item-group">
              <label className="setting-label">
                <input
                  type="checkbox"
                  checked={threadPost}
                  onChange={(e) => {
                    setThreadPost(e.target.checked);
                    handleSettingChange('threadPost', e.target.checked);
                  }}
                  className="setting-checkbox"
                />
                <FaListUl className="setting-icon" />
                <span>Thread Post</span>
              </label>
              <p className="setting-description">
                Break long posts into threaded tweets (Twitter/X). Paragraphs are automatically split at sentence boundaries to keep each tweet under 280 characters.
              </p>

              {/* Show thread numbering option if thread is enabled */}
              {threadPost && (
                <label className="setting-label setting-label-nested">
                  <input
                    type="checkbox"
                    checked={threadNumber}
                    onChange={(e) => {
                      setThreadNumber(e.target.checked);
                      handleSettingChange('threadNumber', e.target.checked);
                    }}
                    className="setting-checkbox"
                  />
                  <span>Add thread numbers (1/n format)</span>
                </label>
              )}
            </div>
          )}

          {/* Instagram Post Type Selector */}
          {hasInstagram && (
            <div className="setting-item">
              <label className="setting-label-block">
                <FaInstagram className="setting-icon" />
                <span>Instagram Post Type</span>
              </label>
              <select
                className="setting-select"
                value={instagramType}
                onChange={(e) => {
                  setInstagramType(e.target.value);
                  handleSettingChange('instagramType', e.target.value);
                }}
              >
                <option value="feed">Feed Post (default)</option>
                <option value="story">Story (24 hours)</option>
                <option value="reel">Reel (video)</option>
              </select>
              <p className="setting-description">
                {instagramType === 'feed' && 'Standard Instagram post that appears in feeds'}
                {instagramType === 'story' && 'Temporary post that disappears after 24 hours. Images must be between 320px and 1920px wide.'}
                {instagramType === 'reel' && 'Short-form video content (requires video)'}
              </p>
            </div>
          )}

          {/* Help text if no platforms selected */}
          {selectedPlatforms.length === 0 && (
            <div className="setting-empty">
              <p>Select social media platforms above to see posting options</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PostSettings;
