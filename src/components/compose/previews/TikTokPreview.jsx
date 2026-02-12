import React, { useState } from 'react';
import { linkifyText } from '../../../utils/linkifyText';
import { StatusBarIcons } from '../PlatformIcons';
import { AiOutlineHeart, AiFillHeart } from 'react-icons/ai';
import { FaRegComment, FaUser } from 'react-icons/fa';
import { BsBookmark, BsShare } from 'react-icons/bs';
import './TikTokPreview.css';

export const TikTokPreview = ({ post, mediaPreviews = [], accountInfo }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentMedia = mediaPreviews[currentIndex] || mediaPreviews[0];

  return (
    <div className="tiktok-preview-v2">
      {/* Status Bar */}
      <div className="tt-status-bar">
        <span className="tt-time">9:41</span>
        <div className="tt-notch"></div>
        <div className="tt-status-icons">
          <StatusBarIcons.Cellular />
          <StatusBarIcons.Wifi />
          <StatusBarIcons.Battery percentage={85} />
        </div>
      </div>

      {/* Top Header */}
      <div className="tt-header">
        <div className="tt-tab">Following</div>
        <div className="tt-tab tt-tab-active">For You</div>
        <svg viewBox="0 0 24 24" fill="currentColor" className="tt-search-icon">
          <path d="M10 18a7.952 7.952 0 0 0 4.897-1.688l4.396 4.396 1.414-1.414-4.396-4.396A7.952 7.952 0 0 0 18 10c0-4.411-3.589-8-8-8s-8 3.589-8 8 3.589 8 8 8zm0-14c3.309 0 6 2.691 6 6s-2.691 6-6 6-6-2.691-6-6 2.691-6 6-6z" />
        </svg>
      </div>

      {/* Full-screen video/image background */}
      <div className="tt-content">
        {currentMedia ? (
          <div className="tt-media-bg">
            {currentMedia.type === 'image' ? (
              <img
                src={currentMedia.dataUrl}
                alt="TikTok media"
                className="tt-media"
              />
            ) : (
              <video
                src={currentMedia.dataUrl}
                className="tt-media"
                playsInline
                loop
                muted
              />
            )}
            <div className="tt-gradient-overlay"></div>
          </div>
        ) : (
          <div className="tt-media-placeholder">
            <svg viewBox="0 0 48 48" fill="white" className="tt-logo-large">
              <path d="M38.43.03H34.2c-1.02 0-1.85.82-1.85 1.84V21.4c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c.55 0 1.09.05 1.62.15V8.3c-.54-.06-1.08-.1-1.62-.1-6.63 0-12 5.37-12 12s5.37 12 12 12 12-5.37 12-12V10.7c2.15 1.46 4.75 2.32 7.55 2.32.55 0 1-.45 1-1V8.88c0-.55-.45-1-1-1-3.86 0-7-3.14-7-7V1.87c0-1.02-.82-1.84-1.84-1.84z" />
            </svg>
          </div>
        )}

        {/* Right sidebar actions */}
        <div className="tt-sidebar">
          <div className="tt-sidebar-item">
            {accountInfo?.profilePicture ? (
              <div className="tt-avatar-ring">
                <img
                  src={accountInfo.profilePicture}
                  alt={accountInfo.username || 'User'}
                  className="tt-avatar"
                />
              </div>
            ) : (
              <div className="tt-avatar tt-avatar-default">
                <FaUser size={16} />
              </div>
            )}
            <div className="tt-follow-btn">+</div>
          </div>

          <div className="tt-sidebar-item">
            <button
              className="tt-action-btn"
              onClick={() => setIsLiked(!isLiked)}
              type="button"
            >
              {isLiked ? (
                <AiFillHeart size={32} color="#FE2C55" />
              ) : (
                <AiOutlineHeart size={32} />
              )}
            </button>
            <span className="tt-count">0</span>
          </div>

          <div className="tt-sidebar-item">
            <button className="tt-action-btn" type="button">
              <FaRegComment size={28} />
            </button>
            <span className="tt-count">0</span>
          </div>

          <div className="tt-sidebar-item">
            <button className="tt-action-btn" type="button">
              <BsBookmark size={26} />
            </button>
            <span className="tt-count">0</span>
          </div>

          <div className="tt-sidebar-item">
            <button className="tt-action-btn" type="button">
              <BsShare size={26} />
            </button>
            <span className="tt-count">0</span>
          </div>

          {/* Spinning disc */}
          <div className="tt-disc">
            <div className="tt-disc-inner">
              {accountInfo?.profilePicture ? (
                <img
                  src={accountInfo.profilePicture}
                  alt="Disc"
                  className="tt-disc-img"
                />
              ) : (
                <div className="tt-disc-placeholder">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom info */}
        <div className="tt-info">
          <div className="tt-user-row">
            <span className="tt-username">
              @{accountInfo?.username || 'yourusername'}
            </span>
          </div>
          {post?.text && (
            <div className="tt-caption">
              {linkifyText(post.text)}
            </div>
          )}
          <div className="tt-music-row">
            <svg viewBox="0 0 24 24" fill="currentColor" className="tt-music-icon">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
            <span className="tt-music-text">Original sound - {accountInfo?.username || 'yourusername'}</span>
          </div>
        </div>

        {/* Media indicators */}
        {mediaPreviews.length > 1 && (
          <div className="tt-indicators">
            {mediaPreviews.slice(0, 5).map((_, idx) => (
              <button
                key={idx}
                className={`tt-indicator ${idx === currentIndex ? 'active' : ''}`}
                onClick={() => setCurrentIndex(idx)}
                type="button"
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="tt-nav">
        <div className="tt-nav-item tt-nav-active">
          <svg viewBox="0 0 48 48" fill="currentColor">
            <path d="M23.5 3.5 0.5 23.5h6v20h14v-14h6v14h14v-20h6L23.5 3.5z" />
          </svg>
          <span>Home</span>
        </div>
        <div className="tt-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <span>Discover</span>
        </div>
        <div className="tt-nav-item tt-nav-create">
          <div className="tt-create-btn">
            <div className="tt-create-icon-left"></div>
            <div className="tt-create-icon-center">+</div>
            <div className="tt-create-icon-right"></div>
          </div>
        </div>
        <div className="tt-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
          </svg>
          <span>Inbox</span>
        </div>
        <div className="tt-nav-item">
          {accountInfo?.profilePicture ? (
            <img
              src={accountInfo.profilePicture}
              alt="Profile"
              className="tt-nav-avatar"
            />
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
            </svg>
          )}
          <span>Me</span>
        </div>
      </div>
    </div>
  );
};

export default TikTokPreview;
