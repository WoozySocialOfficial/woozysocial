import React, { useState } from 'react';
import { linkifyText } from '../../../utils/linkifyText';
import { MediaCarousel } from '../MediaCarousel';
import { StatusBarIcons, ActionIcons, NavIcons, VerifiedBadge } from '../PlatformIcons';
import {
  AiFillHeart,
  AiOutlineHeart,
  AiOutlineComment,
  AiOutlineSend
} from 'react-icons/ai';
import { BsBookmark, BsThreeDots } from 'react-icons/bs';
import { FaHome, FaSearch, FaPlus, FaUser } from 'react-icons/fa';
import { IoMdVideocam } from 'react-icons/io';
import './InstagramPreview.css';

export const InstagramPreview = ({ post, mediaPreviews = [], accountInfo }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [showFullCaption, setShowFullCaption] = useState(false);

  const truncateCaption = (text, maxLength = 125) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const displayCaption = showFullCaption ? post?.text : truncateCaption(post?.text);
  const needsMore = post?.text && post.text.length > 125;

  return (
    <div className="instagram-preview-v2">
      {/* Status Bar */}
      <div className="ig-status-bar">
        <span className="ig-time">9:41</span>
        <div className="ig-notch"></div>
        <div className="ig-status-icons">
          <StatusBarIcons.Cellular />
          <StatusBarIcons.Wifi />
          <StatusBarIcons.Battery percentage={85} />
        </div>
      </div>

      {/* App Header */}
      <div className="ig-header">
        <svg className="ig-logo" width="120" height="29" viewBox="0 0 120 29" fill="none">
          <text x="0" y="22" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" fontSize="24" fontWeight="600" fill="currentColor">Instagram</text>
        </svg>
        <div className="ig-header-icons">
          <AiOutlineHeart size={24} />
          <AiOutlineComment size={24} style={{ transform: 'scaleX(-1)' }} />
        </div>
      </div>

      {/* Scrollable Feed Area */}
      <div className="ig-feed">
        {/* Post */}
        <div className="ig-post">
          {/* Post Header */}
          <div className="ig-post-header">
            <div className="ig-profile-section">
              <div className="ig-avatar-container">
                {/* Story ring gradient */}
                <div className="ig-story-ring">
                  {accountInfo?.profilePicture ? (
                    <img
                      src={accountInfo.profilePicture}
                      alt={accountInfo.username || 'User'}
                      className="ig-avatar"
                    />
                  ) : (
                    <div className="ig-avatar ig-avatar-default">
                      <FaUser size={16} />
                    </div>
                  )}
                </div>
              </div>
              <div className="ig-username-section">
                <span className="ig-username">
                  {accountInfo?.username || 'your_username'}
                  {accountInfo?.verified && (
                    <VerifiedBadge filled color="#0095F6" className="ig-verified" />
                  )}
                </span>
              </div>
            </div>
            <BsThreeDots size={20} className="ig-more-icon" />
          </div>

          {/* Media Carousel */}
          {mediaPreviews && mediaPreviews.length > 0 && (
            <div className="ig-media-container">
              <MediaCarousel
                media={mediaPreviews}
                platform="instagram"
                showControls={true}  // Enable arrow controls for web preview
                showIndicators={true}
                showCounter={mediaPreviews.length > 1}
              />
            </div>
          )}

          {/* Actions */}
          <div className="ig-actions">
            <div className="ig-actions-left">
              <button
                onClick={() => setIsLiked(!isLiked)}
                className="ig-action-btn"
                type="button"
              >
                {isLiked ? (
                  <AiFillHeart size={27} color="#FF3040" />
                ) : (
                  <AiOutlineHeart size={27} />
                )}
              </button>
              <button className="ig-action-btn" type="button">
                <AiOutlineComment size={26} style={{ transform: 'scaleX(-1)' }} />
              </button>
              <button className="ig-action-btn" type="button">
                <AiOutlineSend size={25} />
              </button>
            </div>
            <button className="ig-action-btn" type="button">
              <BsBookmark size={22} />
            </button>
          </div>

          {/* Likes */}
          <div className="ig-likes">
            <span>Be the first to like this</span>
          </div>

          {/* Caption */}
          {post?.text && (
            <div className="ig-caption">
              <span className="ig-caption-username">
                {accountInfo?.username || 'your_username'}
              </span>{' '}
              <span className="ig-caption-text">
                {linkifyText(displayCaption)}
                {needsMore && (
                  <button
                    className="ig-caption-more"
                    onClick={() => setShowFullCaption(!showFullCaption)}
                    type="button"
                  >
                    {showFullCaption ? ' less' : ' more'}
                  </button>
                )}
              </span>
            </div>
          )}

          {/* Timestamp */}
          <div className="ig-timestamp">JUST NOW</div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="ig-nav">
        <div className="ig-nav-item ig-nav-active">
          <FaHome size={24} />
        </div>
        <div className="ig-nav-item">
          <FaSearch size={24} />
        </div>
        <div className="ig-nav-item">
          <FaPlus size={24} />
        </div>
        <div className="ig-nav-item">
          <IoMdVideocam size={26} />
        </div>
        <div className="ig-nav-item">
          {accountInfo?.profilePicture ? (
            <img
              src={accountInfo.profilePicture}
              alt="Profile"
              className="ig-nav-avatar"
            />
          ) : (
            <FaUser size={20} />
          )}
        </div>
      </div>
    </div>
  );
};

export default InstagramPreview;
