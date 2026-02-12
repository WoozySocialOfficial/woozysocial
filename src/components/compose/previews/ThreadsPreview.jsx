import React, { useState } from 'react';
import { linkifyText } from '../../../utils/linkifyText';
import { StatusBarIcons } from '../PlatformIcons';
import { AiOutlineHeart, AiFillHeart } from 'react-icons/ai';
import { FaRegComment, FaUser } from 'react-icons/fa';
import { BsThreeDots } from 'react-icons/bs';
import { BiRepost } from 'react-icons/bi';
import { IoSend } from 'react-icons/io5';
import './ThreadsPreview.css';

export const ThreadsPreview = ({ post, mediaPreviews = [], accountInfo }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <div className="threads-preview-v2">
      {/* Status Bar */}
      <div className="th-status-bar">
        <span className="th-time">9:41</span>
        <div className="th-notch"></div>
        <div className="th-status-icons">
          <StatusBarIcons.Cellular />
          <StatusBarIcons.Wifi />
          <StatusBarIcons.Battery percentage={85} />
        </div>
      </div>

      {/* App Header */}
      <div className="th-header">
        <svg viewBox="0 0 192 192" className="th-logo">
          <path fill="currentColor" d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.78 9.452c5.73-8.695 14.538-10.96 21.78-10.96h.16c7.686.044 13.72 2.08 17.93 6.084 3.916 3.728 6.272 9.146 6.62 15.203-6.263-1.534-13.067-2.258-20.254-2.152-14.708.21-26.716 4.337-35.732 12.274-9.302 8.217-14.175 19.556-14.117 32.836.053 11.782 4.302 21.653 12.322 28.622 7.85 6.812 18.236 10.193 30.903 10.083 12.165-.096 22.583-4.38 30.945-12.734 6.885-6.89 11.39-15.884 13.41-26.76 4.81 2.752 8.686 6.005 11.516 9.67 4.827 6.254 7.254 13.72 7.254 22.303v.175c-.108 10.296-3.698 18.516-10.695 24.462-6.748 5.738-15.87 8.552-27.134 8.372-19.32-.316-36.942-15.158-44.255-37.268l-16.938 4.91c9.182 27.706 32.602 47.244 58.696 47.687h.735c15.406 0 28.445-4.594 38.757-13.65 10.854-9.53 16.486-22.644 16.616-38.83v-.262c0-11.205-3.262-21.353-9.732-30.248-5.443-7.478-12.825-13.223-21.944-17.075ZM95.657 121.665c-8.548.082-15.587-2.206-20.914-6.794-5.18-4.458-7.838-10.537-7.914-18.1-.07-7.094 2.386-13.014 7.44-17.852 5.202-4.978 12.555-7.62 21.838-7.788 6.23-.09 12.064.592 17.368 2.028-.13 8.18-2.485 15.496-7.02 21.773-5.04 6.984-11.61 10.65-19.798 10.733Z" />
        </svg>
      </div>

      {/* Feed */}
      <div className="th-feed">
        {/* Thread */}
        <div className="th-thread">
          {/* Thread Header */}
          <div className="th-thread-header">
            <div className="th-avatar-section">
              <div className="th-avatar-container">
                {accountInfo?.profilePicture ? (
                  <img
                    src={accountInfo.profilePicture}
                    alt={accountInfo.username || 'User'}
                    className="th-avatar"
                  />
                ) : (
                  <div className="th-avatar th-avatar-default">
                    <FaUser size={18} />
                  </div>
                )}
              </div>
            </div>
            <div className="th-content-section">
              <div className="th-user-row">
                <span className="th-username">
                  {accountInfo?.username || 'yourusername'}
                </span>
                <span className="th-timestamp">1m</span>
                <BsThreeDots size={18} className="th-more-icon" />
              </div>

              {/* Thread Text */}
              {post?.text && (
                <div className="th-text">
                  {linkifyText(post.text)}
                </div>
              )}

              {/* Media */}
              {mediaPreviews && mediaPreviews.length > 0 && (
                <div className="th-media-container">
                  {mediaPreviews.length === 1 ? (
                    <div className="th-media-single">
                      {mediaPreviews[0].type === 'image' ? (
                        <img
                          src={mediaPreviews[0].dataUrl}
                          alt="Media"
                          className="th-media-image"
                        />
                      ) : (
                        <video
                          src={mediaPreviews[0].dataUrl}
                          className="th-media-video"
                          controls={false}
                          playsInline
                        />
                      )}
                    </div>
                  ) : (
                    <div className="th-media-grid">
                      {mediaPreviews.slice(0, 4).map((media, index) => (
                        <div key={media.id || index} className="th-media-item">
                          {media.type === 'image' ? (
                            <img
                              src={media.dataUrl}
                              alt={`Media ${index + 1}`}
                              className="th-media-image"
                            />
                          ) : (
                            <video
                              src={media.dataUrl}
                              className="th-media-video"
                              controls={false}
                              playsInline
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="th-actions">
                <button
                  className={`th-action-btn ${isLiked ? 'active' : ''}`}
                  onClick={() => setIsLiked(!isLiked)}
                  type="button"
                >
                  {isLiked ? (
                    <AiFillHeart size={20} color="#FA3E5F" />
                  ) : (
                    <AiOutlineHeart size={20} />
                  )}
                </button>
                <button className="th-action-btn" type="button">
                  <FaRegComment size={19} />
                </button>
                <button className="th-action-btn" type="button">
                  <BiRepost size={22} />
                </button>
                <button className="th-action-btn" type="button">
                  <IoSend size={20} />
                </button>
              </div>

              {/* Engagement Stats */}
              <div className="th-stats">
                <span className="th-stat-text">0 replies · 0 likes</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="th-nav">
        <div className="th-nav-item th-nav-active">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.464 1.286C10.294.803 11.092.5 12 .5c.908 0 1.707.303 2.537.786.795.462 1.7 1.142 2.815 2.083l2.232 1.88a2.8 2.8 0 0 1 .944 2.117v7.135a2.8 2.8 0 0 1-.944 2.116l-2.232 1.88c-1.115.942-2.02 1.622-2.815 2.084-.83.483-1.629.786-2.537.786-.908 0-1.707-.303-2.536-.786-.795-.462-1.7-1.142-2.816-2.083l-2.232-1.88a2.8 2.8 0 0 1-.944-2.117V6.866a2.8 2.8 0 0 1 .944-2.116l2.232-1.88C7.764 2.428 8.668 1.748 9.464 1.286z" />
          </svg>
        </div>
        <div className="th-nav-item">
          <svg viewBox="0 0 26 26" fill="currentColor">
            <circle cx="13" cy="13" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M9 9h.01M17 9h.01M8 15s1.5 2 5 2 5-2 5-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="th-nav-item">
          <svg viewBox="0 0 26 26" fill="currentColor">
            <path d="M12 6v6h4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        </div>
        <div className="th-nav-item">
          <svg viewBox="0 0 26 26" fill="currentColor">
            <path d="M13 7a6 6 0 0 0-5.468 3.572.75.75 0 0 1-1.37-.61 7.5 7.5 0 0 1 13.676 0 .75.75 0 0 1-1.37.61A6 6 0 0 0 13 7z" />
            <path d="M3.177 11.18a.75.75 0 0 1 .823.676 10 10 0 0 0 19.8 0 .75.75 0 1 1 1.499.146 11.5 11.5 0 0 1-22.8 0 .75.75 0 0 1 .677-.822z" />
            <path d="M13 19a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
          </svg>
        </div>
        <div className="th-nav-item">
          {accountInfo?.profilePicture ? (
            <img
              src={accountInfo.profilePicture}
              alt="Profile"
              className="th-nav-avatar"
            />
          ) : (
            <div className="th-nav-avatar-default">
              <FaUser size={14} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThreadsPreview;
