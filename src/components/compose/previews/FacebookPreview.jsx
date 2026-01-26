import React, { useState } from 'react';
import { StatusBarIcons } from '../PlatformIcons';
import {
  AiOutlineHeart,
  AiFillHeart,
  AiOutlineComment,
  AiOutlineShareAlt
} from 'react-icons/ai';
import { BsThreeDots } from 'react-icons/bs';
import { FaUser, FaThumbsUp, FaRegThumbsUp } from 'react-icons/fa';
import { BiWorld } from 'react-icons/bi';
import './FacebookPreview.css';

export const FacebookPreview = ({ post, mediaPreviews = [], accountInfo }) => {
  const [isLiked, setIsLiked] = useState(false);

  // Determine grid layout based on number of images
  const getImageGridClass = () => {
    const count = mediaPreviews.length;
    if (count === 0) return '';
    if (count === 1) return 'fb-grid-1';
    if (count === 2) return 'fb-grid-2';
    if (count === 3) return 'fb-grid-3';
    if (count === 4) return 'fb-grid-4';
    return 'fb-grid-5';
  };

  return (
    <div className="facebook-preview-v2">
      {/* Status Bar */}
      <div className="fb-status-bar">
        <span className="fb-time">9:41</span>
        <div className="fb-notch"></div>
        <div className="fb-status-icons">
          <StatusBarIcons.Cellular />
          <StatusBarIcons.Wifi />
          <StatusBarIcons.Battery percentage={85} />
        </div>
      </div>

      {/* App Header */}
      <div className="fb-header">
        <div className="fb-header-left">
          <svg viewBox="0 0 36 36" fill="url(#fb-gradient)" className="fb-logo">
            <defs>
              <linearGradient x1="50%" x2="50%" y1="97.0782153%" y2="0%" id="fb-gradient">
                <stop offset="0%" stopColor="#0062E0" />
                <stop offset="100%" stopColor="#19AFFF" />
              </linearGradient>
            </defs>
            <path d="M15 35.8C6.5 34.3 0 26.9 0 18 0 8.1 8.1 0 18 0s18 8.1 18 18c0 8.9-6.5 16.3-15 17.8l-1-.8h-4l-1 .8z" />
            <path fill="white" d="M25 23l.8-5H21v-3.5c0-1.4.5-2.5 2.7-2.5H26V7.4c-1.3-.2-2.7-.4-4-.4-4.1 0-7 2.5-7 7v4h-4.5v5H15v12.7c1 .2 2 .3 3 .3s2-.1 3-.3V23h4z" />
          </svg>
          <span className="fb-logo-text">facebook</span>
        </div>
        <div className="fb-header-right">
          <svg viewBox="0 0 24 24" fill="currentColor" className="fb-header-icon">
            <path d="M10 18a7.952 7.952 0 0 0 4.897-1.688l4.396 4.396 1.414-1.414-4.396-4.396A7.952 7.952 0 0 0 18 10c0-4.411-3.589-8-8-8s-8 3.589-8 8 3.589 8 8 8zm0-14c3.309 0 6 2.691 6 6s-2.691 6-6 6-6-2.691-6-6 2.691-6 6-6z" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="fb-header-icon">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" />
            <path d="M14.5 8.5h-5v7h5v-7z" />
          </svg>
        </div>
      </div>

      {/* Feed Tabs */}
      <div className="fb-tabs">
        <div className="fb-tab fb-tab-active">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.5 3.5h3v3h-3v-3zm0 5h3v3h-3v-3zm0 5h3v3h-3v-3zm0 5h3v3h-3v-3zm5-15h3v3h-3v-3zm0 5h3v3h-3v-3zm0 5h3v3h-3v-3zm0 5h3v3h-3v-3zm-10-15h3v3h-3v-3zm0 5h3v3h-3v-3zm0 5h3v3h-3v-3zm0 5h3v3h-3v-3z" />
          </svg>
        </div>
        <div className="fb-tab">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z" />
          </svg>
        </div>
        <div className="fb-tab">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="fb-tab">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
          </svg>
        </div>
        <div className="fb-tab">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
          </svg>
        </div>
      </div>

      {/* Feed */}
      <div className="fb-feed">
        {/* Post */}
        <div className="fb-post">
          {/* Post Header */}
          <div className="fb-post-header">
            <div className="fb-avatar-container">
              {accountInfo?.profilePicture ? (
                <img
                  src={accountInfo.profilePicture}
                  alt={accountInfo.username || 'User'}
                  className="fb-avatar"
                />
              ) : (
                <div className="fb-avatar fb-avatar-default">
                  <FaUser size={18} />
                </div>
              )}
            </div>
            <div className="fb-user-info">
              <div className="fb-name">
                {accountInfo?.displayName || accountInfo?.username || 'Your Name'}
              </div>
              <div className="fb-meta">
                <span>Just now</span>
                <span className="fb-separator">·</span>
                <BiWorld size={12} />
              </div>
            </div>
            <BsThreeDots size={20} className="fb-more-icon" />
          </div>

          {/* Post Text */}
          {post.text && (
            <div className="fb-text">
              {post.text}
            </div>
          )}

          {/* Media Collage */}
          {mediaPreviews && mediaPreviews.length > 0 && (
            <div className={`fb-media-grid ${getImageGridClass()}`}>
              {mediaPreviews.slice(0, 5).map((media, index) => (
                <div
                  key={media.id || index}
                  className={`fb-media-item fb-media-item-${index + 1}`}
                >
                  {media.type === 'image' ? (
                    <img
                      src={media.dataUrl}
                      alt={`Media ${index + 1}`}
                      className="fb-media-image"
                    />
                  ) : (
                    <video
                      src={media.dataUrl}
                      className="fb-media-video"
                      controls={false}
                      playsInline
                    />
                  )}
                  {/* Show +N overlay on 5th image if more than 5 */}
                  {index === 4 && mediaPreviews.length > 5 && (
                    <div className="fb-more-overlay">
                      <span>+{mediaPreviews.length - 5}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reactions Bar */}
          <div className="fb-reactions-bar">
            <div className="fb-reactions-left">
              <div className="fb-reaction-icons">
                <span className="fb-reaction-icon fb-reaction-like">👍</span>
                <span className="fb-reaction-icon fb-reaction-love">❤️</span>
                <span className="fb-reaction-icon fb-reaction-haha">😆</span>
              </div>
              <span className="fb-reaction-count">0</span>
            </div>
            <div className="fb-reactions-right">
              <span className="fb-count-text">0 Comments</span>
              <span className="fb-count-text">0 Shares</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="fb-actions">
            <button
              className={`fb-action-btn ${isLiked ? 'active' : ''}`}
              onClick={() => setIsLiked(!isLiked)}
              type="button"
            >
              {isLiked ? (
                <FaThumbsUp size={18} />
              ) : (
                <FaRegThumbsUp size={18} />
              )}
              <span>Like</span>
            </button>
            <button className="fb-action-btn" type="button">
              <AiOutlineComment size={20} />
              <span>Comment</span>
            </button>
            <button className="fb-action-btn" type="button">
              <AiOutlineShareAlt size={20} />
              <span>Share</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fb-nav">
        <div className="fb-nav-item fb-nav-active">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.464 1.286C10.294.803 11.092.5 12 .5c.908 0 1.707.303 2.537.786.795.462 1.7 1.142 2.815 2.083l2.232 1.88a2.8 2.8 0 0 1 .944 2.117v7.135a2.8 2.8 0 0 1-.944 2.116l-2.232 1.88c-1.115.942-2.02 1.622-2.815 2.084-.83.483-1.629.786-2.537.786-.908 0-1.707-.303-2.536-.786-.795-.462-1.7-1.142-2.816-2.083l-2.232-1.88a2.8 2.8 0 0 1-.944-2.117V6.866a2.8 2.8 0 0 1 .944-2.116l2.232-1.88C7.764 2.428 8.668 1.748 9.464 1.286z" />
          </svg>
        </div>
        <div className="fb-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.5 1A1.5 1.5 0 0017 2.5v3A1.5 1.5 0 0018.5 7h3A1.5 1.5 0 0023 5.5v-3A1.5 1.5 0 0021.5 1h-3zm-7 0A1.5 1.5 0 0010 2.5v3A1.5 1.5 0 0011.5 7h3A1.5 1.5 0 0016 5.5v-3A1.5 1.5 0 0014.5 1h-3zm-7 0A1.5 1.5 0 003 2.5v3A1.5 1.5 0 004.5 7h3A1.5 1.5 0 009 5.5v-3A1.5 1.5 0 007.5 1h-3zm14 7A1.5 1.5 0 0017 9.5v3a1.5 1.5 0 001.5 1.5h3a1.5 1.5 0 001.5-1.5v-3A1.5 1.5 0 0021.5 8h-3zm-7 0A1.5 1.5 0 0010 9.5v3a1.5 1.5 0 001.5 1.5h3a1.5 1.5 0 001.5-1.5v-3A1.5 1.5 0 0014.5 8h-3zm-7 0A1.5 1.5 0 003 9.5v3A1.5 1.5 0 004.5 14h3A1.5 1.5 0 009 12.5v-3A1.5 1.5 0 007.5 8h-3zm14 7a1.5 1.5 0 00-1.5 1.5v3a1.5 1.5 0 001.5 1.5h3a1.5 1.5 0 001.5-1.5v-3a1.5 1.5 0 00-1.5-1.5h-3zm-7 0a1.5 1.5 0 00-1.5 1.5v3a1.5 1.5 0 001.5 1.5h3a1.5 1.5 0 001.5-1.5v-3a1.5 1.5 0 00-1.5-1.5h-3zm-7 0A1.5 1.5 0 003 16.5v3A1.5 1.5 0 004.5 21h3A1.5 1.5 0 009 19.5v-3A1.5 1.5 0 007.5 15h-3z" />
          </svg>
        </div>
        <div className="fb-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 5v7l5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="fb-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.5 3.5h3v3h-3v-3zm0 5h3v3h-3v-3zm0 5h3v3h-3v-3zm5-10h3v3h-3v-3zm0 5h3v3h-3v-3zm0 5h3v3h-3v-3zm-10-10h3v3h-3v-3zm0 5h3v3h-3v-3zm0 5h3v3h-3v-3z" />
          </svg>
        </div>
        <div className="fb-nav-item">
          {accountInfo?.profilePicture ? (
            <img
              src={accountInfo.profilePicture}
              alt="Profile"
              className="fb-nav-avatar"
            />
          ) : (
            <div className="fb-nav-avatar-default">
              <FaUser size={14} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FacebookPreview;
