import React, { useState } from 'react';
import { StatusBarIcons, VerifiedBadge } from '../PlatformIcons';
import {
  AiOutlineHeart,
  AiFillHeart,
  AiOutlineRetweet,
  AiOutlineComment
} from 'react-icons/ai';
import { BsShare, BsThreeDots } from 'react-icons/bs';
import { FaUser } from 'react-icons/fa';
import { IoStatsChart } from 'react-icons/io5';
import './TwitterPreview.css';

export const TwitterPreview = ({ post, mediaPreviews = [], accountInfo }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [isRetweeted, setIsRetweeted] = useState(false);

  // Determine grid layout based on number of images
  const getImageGridClass = () => {
    const count = mediaPreviews.length;
    if (count === 0) return '';
    if (count === 1) return 'twitter-grid-1';
    if (count === 2) return 'twitter-grid-2';
    if (count === 3) return 'twitter-grid-3';
    return 'twitter-grid-4';
  };

  return (
    <div className="twitter-preview-v2">
      {/* Status Bar */}
      <div className="tw-status-bar">
        <span className="tw-time">9:41</span>
        <div className="tw-notch"></div>
        <div className="tw-status-icons">
          <StatusBarIcons.Cellular />
          <StatusBarIcons.Wifi />
          <StatusBarIcons.Battery percentage={85} />
        </div>
      </div>

      {/* App Header */}
      <div className="tw-header">
        <div className="tw-header-left">
          {accountInfo?.profilePicture ? (
            <img
              src={accountInfo.profilePicture}
              alt="Profile"
              className="tw-header-avatar"
            />
          ) : (
            <div className="tw-header-avatar tw-header-avatar-default">
              <FaUser size={14} />
            </div>
          )}
        </div>
        <div className="tw-header-center">
          <svg viewBox="0 0 24 24" className="tw-logo" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </div>
        <div className="tw-header-right">
          <BsThreeDots size={20} />
        </div>
      </div>

      {/* Timeline Feed */}
      <div className="tw-feed">
        {/* Tweet */}
        <div className="tw-tweet">
          {/* Tweet Header */}
          <div className="tw-tweet-header">
            <div className="tw-avatar-container">
              {accountInfo?.profilePicture ? (
                <img
                  src={accountInfo.profilePicture}
                  alt={accountInfo.username || 'User'}
                  className="tw-avatar"
                />
              ) : (
                <div className="tw-avatar tw-avatar-default">
                  <FaUser size={18} />
                </div>
              )}
            </div>
            <div className="tw-user-info">
              <div className="tw-name-row">
                <span className="tw-display-name">
                  {accountInfo?.displayName || accountInfo?.username || 'Your Name'}
                </span>
                {accountInfo?.verified && (
                  <VerifiedBadge filled color="#1D9BF0" className="tw-verified" />
                )}
              </div>
              <span className="tw-username">
                @{accountInfo?.username || 'yourusername'}
              </span>
            </div>
            <BsThreeDots size={18} className="tw-more-icon" />
          </div>

          {/* Tweet Text */}
          {post.text && (
            <div className="tw-text">
              {post.text}
            </div>
          )}

          {/* Media Grid */}
          {mediaPreviews && mediaPreviews.length > 0 && (
            <div className={`tw-media-grid ${getImageGridClass()}`}>
              {mediaPreviews.slice(0, 4).map((media, index) => (
                <div
                  key={media.id || index}
                  className={`tw-media-item tw-media-item-${index + 1}`}
                >
                  {media.type === 'image' ? (
                    <img
                      src={media.dataUrl}
                      alt={`Media ${index + 1}`}
                      className="tw-media-image"
                    />
                  ) : (
                    <video
                      src={media.dataUrl}
                      className="tw-media-video"
                      controls={false}
                      playsInline
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tweet Timestamp */}
          <div className="tw-timestamp">
            <span>Just now</span>
          </div>

          {/* Tweet Stats */}
          <div className="tw-stats">
            <span className="tw-stat-item">
              <strong>0</strong> Retweets
            </span>
            <span className="tw-stat-item">
              <strong>0</strong> Quotes
            </span>
            <span className="tw-stat-item">
              <strong>0</strong> Likes
            </span>
            <span className="tw-stat-item">
              <strong>0</strong> Bookmarks
            </span>
          </div>

          {/* Tweet Actions */}
          <div className="tw-actions">
            <button
              className="tw-action-btn tw-action-comment"
              type="button"
            >
              <AiOutlineComment size={18} />
            </button>
            <button
              className={`tw-action-btn tw-action-retweet ${isRetweeted ? 'active' : ''}`}
              onClick={() => setIsRetweeted(!isRetweeted)}
              type="button"
            >
              <AiOutlineRetweet size={18} />
            </button>
            <button
              className={`tw-action-btn tw-action-like ${isLiked ? 'active' : ''}`}
              onClick={() => setIsLiked(!isLiked)}
              type="button"
            >
              {isLiked ? (
                <AiFillHeart size={18} />
              ) : (
                <AiOutlineHeart size={18} />
              )}
            </button>
            <button className="tw-action-btn tw-action-stats" type="button">
              <IoStatsChart size={18} />
            </button>
            <button className="tw-action-btn tw-action-share" type="button">
              <BsShare size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="tw-nav">
        <div className="tw-nav-item tw-nav-active">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 9c-2.209 0-4 1.791-4 4s1.791 4 4 4 4-1.791 4-4-1.791-4-4-4zm0 6c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2zm0-13.304L.622 8.807l1.06 1.696L3 9.679V19.5C3 20.881 4.119 22 5.5 22h13c1.381 0 2.5-1.119 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696zM19 19.5c0 .276-.224.5-.5.5h-13c-.276 0-.5-.224-.5-.5V8.429l7-4.375 7 4.375V19.5z" />
          </svg>
        </div>
        <div className="tw-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z" />
          </svg>
        </div>
        <div className="tw-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.5 8.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5S11.17 7 12 7s1.5.67 1.5 1.5zM13 17v-5h-2v5h2zm-1 5.25c-5.514 0-10-4.486-10-10s4.486-10 10-10 10 4.486 10 10-4.486 10-10 10zm0-18c-4.411 0-8 3.589-8 8s3.589 8 8 8 8-3.589 8-8-3.589-8-8-8z" />
          </svg>
        </div>
        <div className="tw-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.993 9.042C19.48 5.017 16.054 2 11.996 2s-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.437-1.718 4.9-4h4.236l-1.143-8.958zM12 20c-1.306 0-2.417-.835-2.829-2h5.658c-.412 1.165-1.523 2-2.829 2zm-6.866-4l.847-6.698C6.364 6.272 8.941 4 11.996 4s5.627 2.268 6.013 5.295L18.864 16H5.134z" />
          </svg>
        </div>
        <div className="tw-nav-item">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.471 21H.472l.029-1.027c.184-6.618 3.736-8.977 7-8.977.963 0 1.95.212 2.87.672-.444.478-.851 1.03-1.212 1.656-.507-.204-1.054-.329-1.658-.329-2.767 0-4.57 2.223-4.938 6.004H7.56c-.023.302-.05.599-.088.882-.039.283-.08.558-.124.822-.039.235-.08.469-.125.696-.037.19-.073.381-.111.567-.111.553-.239 1.06-.403 1.535zM9.928 13.997c-.104.042-.207.085-.309.131-1.209.553-2.213 1.513-2.883 2.792-.59 1.128-.924 2.491-1.004 3.993l-.012.208v1.021h1.971l.061-.015c1.543-3.952 4.171-6.002 6.748-7.128.209-.091.403-.175.562-.257.121-.06.244-.123.369-.188.068-.036.134-.07.196-.102.034-.019.07-.04.108-.064l.013-.007c.117-.07.229-.13.335-.183l.115-.059.161-.083c.072-.038.142-.074.211-.11l.154-.076c.068-.033.134-.065.197-.094l.164-.07c.066-.028.129-.054.188-.078l.166-.063c.062-.022.125-.044.187-.064l.165-.053c.072-.022.133-.042.19-.06l.156-.045c.073-.021.125-.036.172-.048l.143-.036c.114-.027.165-.038.215-.048l.12-.023c.093-.017.134-.023.17-.027l.092-.013.188-.02c.031-.003.045-.004.047-.004l1.979-.006.02-1.983c-.019-2.018.018-3.866.138-5.516l.009-.123c.091-.971.217-1.764.406-2.42.26-.887.67-1.645 1.261-2.296-3.33-.67-7.541-.785-7.764 4.125-.03.673-.166 1.236-.484 1.761-.411.684-1.102 1.143-1.956 1.553-1.422.644-1.942 1.055-2.078 1.741z"/>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default TwitterPreview;
