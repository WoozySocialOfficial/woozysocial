import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaPinterest, FaCheck, FaTimes } from 'react-icons/fa';
import { FaTiktok, FaThreads } from 'react-icons/fa6';
import { SiX, SiBluesky } from 'react-icons/si';
import { useConnectedAccounts } from '../../hooks/useQueries';
import { InstagramPreview } from '../compose/previews/InstagramPreview';
import { TwitterPreview } from '../compose/previews/TwitterPreview';
import { FacebookPreview } from '../compose/previews/FacebookPreview';
import { LinkedInPreview } from '../compose/previews/LinkedInPreview';
import { TikTokPreview } from '../compose/previews/TikTokPreview';
import { ThreadsPreview } from '../compose/previews/ThreadsPreview';
import { AnalyticsSection } from '../analytics/AnalyticsSection';
import './ApprovedPostModal.css';

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  twitter: SiX,
  'x/twitter': SiX,
  bluesky: SiBluesky,
  pinterest: FaPinterest,
  threads: FaThreads
};

export const ApprovedPostModal = ({ post, onClose }) => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [selectedPreviewPlatform, setSelectedPreviewPlatform] = useState(null);

  const { data: connectedAccounts } = useConnectedAccounts(activeWorkspace?.id, user?.id);

  // Set initial preview platform
  useEffect(() => {
    if (post?.platforms && post.platforms.length > 0) {
      setSelectedPreviewPlatform(post.platforms[0]);
    }
  }, [post]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Handle Escape key
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [onClose]);

  const getAccountInfo = (platform) => {
    if (!connectedAccounts || !Array.isArray(connectedAccounts)) return null;

    const platformMap = {
      'instagram': 'instagram',
      'facebook': 'facebook',
      'twitter': 'twitter',
      'x/twitter': 'twitter',
      'linkedin': 'linkedin',
      'tiktok': 'tiktok',
      'threads': 'threads'
    };

    const mappedPlatform = platformMap[platform.toLowerCase()] || platform.toLowerCase();
    const account = connectedAccounts.find(
      acc => acc.platform?.toLowerCase() === mappedPlatform
    );

    if (!account) return null;

    return {
      username: account.username || account.platform_username || 'user',
      displayName: account.name || account.display_name || account.username || 'User',
      profilePicture: account.profile_picture || account.profile_image_url,
      verified: account.verified || false
    };
  };

  const renderPreview = (platform) => {
    if (!post) return null;

    const postData = {
      text: post.caption || post.post || ''
    };

    const mediaPreviews = (post.media_urls || [post.media_url])
      .filter(Boolean)
      .map(url => ({
        dataUrl: url,
        type: url?.match(/\.(mp4|mov|webm|avi)$/i) ? 'video' : 'image'
      }));

    const accountInfo = getAccountInfo(platform);
    const platformLower = platform.toLowerCase();

    switch (platformLower) {
      case 'instagram':
        return <InstagramPreview post={postData} mediaPreviews={mediaPreviews} accountInfo={accountInfo} />;
      case 'facebook':
        return <FacebookPreview post={postData} mediaPreviews={mediaPreviews} accountInfo={accountInfo} />;
      case 'twitter':
      case 'x/twitter':
        return <TwitterPreview post={postData} mediaPreviews={mediaPreviews} accountInfo={accountInfo} />;
      case 'linkedin':
        return <LinkedInPreview post={postData} mediaPreviews={mediaPreviews} accountInfo={accountInfo} />;
      case 'tiktok':
        return <TikTokPreview post={postData} mediaPreviews={mediaPreviews} accountInfo={accountInfo} />;
      case 'threads':
        return <ThreadsPreview post={postData} mediaPreviews={mediaPreviews} accountInfo={accountInfo} />;
      default:
        return null;
    }
  };

  const getPlatformIcon = (platform) => {
    const IconComponent = PLATFORM_ICONS[platform.toLowerCase()];
    return IconComponent ? <IconComponent /> : null;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  if (!post) return null;

  return (
    <>
      <div className="approved-modal-overlay" onClick={onClose} />

      <div className="approved-post-modal">
        {/* Header */}
        <div className="approved-modal-header">
          <div className="approved-header-left">
            <h3>Post Details</h3>
          </div>
          <button className="approved-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="approved-modal-body">
          {/* Status Badge */}
          <div className={`approved-status-badge ${post.approval_status}`}>
            {post.approval_status === 'approved' ? <><FaCheck /> Approved</> : <><FaTimes /> Rejected</>}
          </div>

          {/* Platform Preview */}
          {post.platforms && post.platforms.length > 0 && (
            <div className="approved-preview-section">
              <label className="approved-section-label">Platform Preview</label>

              {post.platforms.length > 1 && (
                <div className="approved-platform-switcher">
                  {post.platforms.map((platform) => (
                    <button
                      key={platform}
                      className={`approved-platform-btn ${selectedPreviewPlatform === platform ? 'active' : ''}`}
                      onClick={() => setSelectedPreviewPlatform(platform)}
                      type="button"
                    >
                      {getPlatformIcon(platform)}
                      <span>{platform}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="approved-preview-wrapper">
                <div className="approved-preview-container">
                  {renderPreview(selectedPreviewPlatform || post.platforms[0])}
                </div>
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="approved-dates-section">
            <div className="approved-date-item">
              <span className="approved-date-label">Scheduled</span>
              <span className="approved-date-value">{formatDate(post.scheduled_at)}</span>
            </div>
            {post.reviewed_at && (
              <div className="approved-date-item">
                <span className="approved-date-label">Reviewed</span>
                <span className="approved-date-value">{formatDate(post.reviewed_at)}</span>
              </div>
            )}
          </div>

          {/* Analytics */}
          {post.status === 'posted' && (post.ayr_post_id || post.id) && (
            <div className="approved-analytics-section">
              <AnalyticsSection
                postId={post.ayr_post_id || post.id}
                workspaceId={activeWorkspace?.id}
                platforms={post.platforms || []}
              />
            </div>
          )}

          {/* No analytics fallback for posts that haven't been posted yet */}
          {post.status !== 'posted' && (
            <div className="approved-no-analytics">
              <span className="no-analytics-icon">📊</span>
              <p>Analytics not available for this post</p>
              <p className="no-analytics-hint">Analytics are available for posts that have been published.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
