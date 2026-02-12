import React, { useState } from 'react';
import { linkifyText } from '../../../utils/linkifyText';
import { MediaCarousel } from '../MediaCarousel';
import { StatusBarIcons } from '../PlatformIcons';
import { AiOutlineLike, AiFillLike } from 'react-icons/ai';
import { FaRegComment, FaUser } from 'react-icons/fa';
import { BsThreeDots, BsSend } from 'react-icons/bs';
import { BiRepost } from 'react-icons/bi';
import './LinkedInPreview.css';

export const LinkedInPreview = ({ post, mediaPreviews = [], accountInfo }) => {
  const [isLiked, setIsLiked] = useState(false);

  return (
    <div className="linkedin-preview-v2">
      {/* Status Bar */}
      <div className="li-status-bar">
        <span className="li-time">9:41</span>
        <div className="li-notch"></div>
        <div className="li-status-icons">
          <StatusBarIcons.Cellular />
          <StatusBarIcons.Wifi />
          <StatusBarIcons.Battery percentage={85} />
        </div>
      </div>

      {/* App Header */}
      <div className="li-header">
        <div className="li-search-bar">
          <svg viewBox="0 0 24 24" fill="currentColor" className="li-search-icon">
            <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z" />
          </svg>
          <span className="li-search-text">Search</span>
        </div>
        <svg viewBox="0 0 24 24" fill="currentColor" className="li-header-icon">
          <path d="M16 4h-12c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-12c0-1.1-.9-2-2-2zm0 14h-12v-12h12v12zm-11-5.37l2.5 2.5 2.5-2.5 1.06 1.06-3.56 3.56-3.56-3.56 1.06-1.06zm8-1.06l-1.06 1.06 3.56 3.56 3.56-3.56-1.06-1.06-2.5 2.5-2.5-2.5z" />
        </svg>
      </div>

      {/* Feed */}
      <div className="li-feed">
        {/* Post */}
        <div className="li-post">
          {/* Post Header */}
          <div className="li-post-header">
            <div className="li-avatar-container">
              {accountInfo?.profilePicture ? (
                <img
                  src={accountInfo.profilePicture}
                  alt={accountInfo.username || 'User'}
                  className="li-avatar"
                />
              ) : (
                <div className="li-avatar li-avatar-default">
                  <FaUser size={18} />
                </div>
              )}
            </div>
            <div className="li-user-info">
              <div className="li-name">
                {accountInfo?.displayName || accountInfo?.username || 'Your Name'}
              </div>
              <div className="li-headline">
                Professional · Just now
              </div>
            </div>
            <BsThreeDots size={20} className="li-more-icon" />
          </div>

          {/* Post Text */}
          {post?.text && (
            <div className="li-text">
              {linkifyText(post.text)}
            </div>
          )}

          {/* Media Carousel */}
          {mediaPreviews && mediaPreviews.length > 0 && (
            <div className="li-media-container">
              <MediaCarousel
                media={mediaPreviews}
                platform="linkedin"
                showControls={true}
                showIndicators={true}
                showCounter={false}
              />
            </div>
          )}

          {/* Engagement Bar */}
          <div className="li-engagement-bar">
            <div className="li-reactions">
              <div className="li-reaction-icons">
                <span className="li-reaction-icon li-reaction-like">👍</span>
                <span className="li-reaction-icon li-reaction-celebrate">🎉</span>
                <span className="li-reaction-icon li-reaction-love">❤️</span>
              </div>
              <span className="li-reaction-count">0</span>
            </div>
            <div className="li-engagement-right">
              <span className="li-engagement-text">0 comments · 0 reposts</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="li-actions">
            <button
              className={`li-action-btn ${isLiked ? 'active' : ''}`}
              onClick={() => setIsLiked(!isLiked)}
              type="button"
            >
              {isLiked ? (
                <AiFillLike size={20} />
              ) : (
                <AiOutlineLike size={20} />
              )}
              <span>Like</span>
            </button>
            <button className="li-action-btn" type="button">
              <FaRegComment size={18} />
              <span>Comment</span>
            </button>
            <button className="li-action-btn" type="button">
              <BiRepost size={22} />
              <span>Repost</span>
            </button>
            <button className="li-action-btn" type="button">
              <BsSend size={18} />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="li-nav">
        <div className="li-nav-item li-nav-active">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M23 9v2h-2v7c0 1.7-1.3 3-3 3h-4v-6h-4v6H6c-1.7 0-3-1.3-3-3v-7H1V9l11-7 5 3.2V2h3v5.1z" />
          </svg>
          <span>Home</span>
        </div>
        <div className="li-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 16v6H3v-6c0-.6.4-1 1-1h7c.6 0 1 .4 1 1zM8 12c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4zm8 4h6v2h-6v-2zm0-4h6v2h-6v-2zm0-4h6v2h-6V8z" />
          </svg>
          <span>Network</span>
        </div>
        <div className="li-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 6V5c0-1.7-1.3-3-3-3h-4C8.3 2 7 3.3 7 5v1H3v15c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6h-4zM9 5c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v1H9V5zm10 16H5V8h14v13z" />
          </svg>
          <span>Post</span>
        </div>
        <div className="li-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 10v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-8c0-1.1.9-2 2-2h4l2-3h4l2 3h4c1.1 0 2 .9 2 2zm-10 7c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4z" />
          </svg>
          <span>Notifications</span>
        </div>
        <div className="li-nav-item">
          {accountInfo?.profilePicture ? (
            <img
              src={accountInfo.profilePicture}
              alt="Profile"
              className="li-nav-avatar"
            />
          ) : (
            <div className="li-nav-avatar-default">
              <FaUser size={14} />
            </div>
          )}
          <span>Me</span>
        </div>
      </div>
    </div>
  );
};

export default LinkedInPreview;
