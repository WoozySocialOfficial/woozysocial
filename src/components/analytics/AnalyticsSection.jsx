import { useState, useEffect } from 'react';
import { FaEye, FaHeart, FaComment, FaShare, FaSyncAlt, FaChartLine, FaUsers } from 'react-icons/fa';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaTiktok } from 'react-icons/fa';
import { SiX } from 'react-icons/si';
import { MetricCard } from './MetricCard';
import { baseURL } from '../../utils/constants';
import './AnalyticsSection.css';

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  twitter: SiX,
  'x/twitter': SiX,
  x: SiX
};

/**
 * AnalyticsSection - Display analytics for a post with platform tabs
 *
 * @param {string} postId - Ayrshare post ID
 * @param {string} workspaceId - Workspace ID
 * @param {string[]} platforms - Array of platform names (e.g., ["facebook", "instagram"])
 */
export const AnalyticsSection = ({ postId, workspaceId, platforms: _platforms = [] }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  // Fetch analytics on mount
  useEffect(() => {
    if (postId && workspaceId) {
      fetchAnalytics();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, workspaceId]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${baseURL}/api/post/analytics?postId=${postId}&workspaceId=${workspaceId}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch analytics');
      }

      if (data.success && data.data) {
        setAnalytics(data.data);
      } else {
        throw new Error('Invalid analytics response');
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchAnalytics();
  };

  // Get current metrics based on active tab
  const getCurrentMetrics = () => {
    if (!analytics) return null;

    if (activeTab === 'all') {
      return analytics.aggregated;
    }

    return analytics.byPlatform[activeTab] || null;
  };

  const currentMetrics = getCurrentMetrics();

  // Platform icon component
  const PlatformIcon = ({ platform }) => {
    const Icon = PLATFORM_ICONS[platform.toLowerCase()] || FaChartLine;
    return <Icon className="platform-tab-icon" />;
  };

  // Loading state
  if (loading) {
    return (
      <div className="analytics-section">
        <div className="analytics-header">
          <h4>📊 Analytics</h4>
        </div>
        <div className="analytics-loading">
          <div className="loading-spinner"></div>
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="analytics-section">
        <div className="analytics-header">
          <h4>📊 Analytics</h4>
          <button onClick={handleRefresh} className="refresh-btn" title="Retry">
            <FaSyncAlt />
          </button>
        </div>
        <div className="analytics-error">
          <p className="error-message">⚠️ {error}</p>
          <p className="error-hint">
            Analytics may take 24-48 hours to become available after posting.
          </p>
          <button onClick={handleRefresh} className="retry-btn">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Empty state (no analytics data)
  if (!analytics || !currentMetrics) {
    return (
      <div className="analytics-section">
        <div className="analytics-header">
          <h4>📊 Analytics</h4>
          <button onClick={handleRefresh} className="refresh-btn">
            <FaSyncAlt />
          </button>
        </div>
        <div className="analytics-empty">
          <p>📊 No analytics available yet</p>
          <p className="empty-hint">Analytics typically become available 24-48 hours after posting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-section">
      {/* Header */}
      <div className="analytics-header">
        <h4>📊 Analytics</h4>
        <button
          onClick={handleRefresh}
          className="refresh-btn"
          disabled={loading}
          title="Refresh analytics"
        >
          <FaSyncAlt className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {/* Platform Tabs */}
      <div className="platform-tabs">
        <button
          className={`platform-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All Platforms
        </button>
        {Object.keys(analytics.byPlatform).map((platform) => (
          <button
            key={platform}
            className={`platform-tab platform-tab-icon-only ${
              activeTab === platform ? 'active' : ''
            }`}
            onClick={() => setActiveTab(platform)}
            title={platform.charAt(0).toUpperCase() + platform.slice(1)}
          >
            <PlatformIcon platform={platform} />
          </button>
        ))}
      </div>

      {/* Tab Label (for non-all tabs) */}
      {activeTab !== 'all' && (
        <div className="platform-label">
          <PlatformIcon platform={activeTab} />
          <span>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="analytics-metrics">
        <MetricCard
          icon={<FaEye />}
          label="Views"
          value={currentMetrics.views}
          unavailable={currentMetrics.views === null}
        />
        <MetricCard
          icon={<FaHeart />}
          label="Likes"
          value={currentMetrics.likes}
          unavailable={currentMetrics.likes === null}
        />
        <MetricCard
          icon={<FaComment />}
          label="Comments"
          value={currentMetrics.comments}
          unavailable={currentMetrics.comments === null}
        />
        <MetricCard
          icon={<FaShare />}
          label="Shares"
          value={currentMetrics.shares}
          unavailable={currentMetrics.shares === null}
        />
      </div>

      {/* Summary Stats */}
      <div className="analytics-summary">
        <div className="summary-stat">
          <span className="summary-label">
            <FaChartLine className="summary-icon" /> Engagement Rate
          </span>
          <span className="summary-value">
            {currentMetrics.engagementRate !== null && currentMetrics.engagementRate !== undefined
              ? `${currentMetrics.engagementRate}%`
              : '—'}
          </span>
        </div>

        {currentMetrics.reach !== null && (
          <div className="summary-stat">
            <span className="summary-label">
              <FaUsers className="summary-icon" /> Total Reach
            </span>
            <span className="summary-value">
              {currentMetrics.reach >= 1000
                ? `${(currentMetrics.reach / 1000).toFixed(1)}K`
                : currentMetrics.reach}
            </span>
          </div>
        )}

        {activeTab === 'all' && analytics.platformCount > 0 && (
          <div className="summary-stat">
            <span className="summary-label">Platforms</span>
            <span className="summary-value">{analytics.platformCount}</span>
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="analytics-footer">
        <span className="analytics-timestamp">
          Last updated: {new Date(analytics.fetchedAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};
