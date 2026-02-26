
/**
 * Platform Preview Components
 * Each component renders a realistic preview of how a post will appear on that platform
 */

// Instagram Preview
export const InstagramPreview = ({ post, mediaPreview, mediaType, accountInfo, profileName: _profileName }) => (
  <div className="platform-preview instagram-preview">
    <div className="status-bar">
      <span className="status-time">9:41</span>
      <div className="status-icons">
        <span>📶</span>
        <span>📡</span>
        <span>🔋</span>
      </div>
    </div>

    <div className="instagram-header">
      <span className="header-icon">📷</span>
      <span className="header-title">Instagram</span>
      <div className="header-icons">
        <span>♡</span>
        <span>💬</span>
      </div>
    </div>

    <div className="instagram-feed">
      <div className="instagram-post">
        <div className="instagram-post-header">
          <div className="instagram-profile">
            {accountInfo.profilePicture ? (
              <img src={accountInfo.profilePicture} alt="Profile" className="preview-avatar-img" />
            ) : (
              <div className="preview-avatar">👤</div>
            )}
            <span className="preview-username">{accountInfo.username}</span>
          </div>
          <div className="preview-menu">⋯</div>
        </div>

        {mediaPreview && (
          <div className="instagram-media">
            {mediaType === "image" ? (
              <img src={mediaPreview} alt="Preview" />
            ) : (
              <video src={mediaPreview} controls />
            )}
          </div>
        )}

        <div className="instagram-actions">
          <div className="instagram-left-actions">
            <span>♡</span>
            <span>💬</span>
            <span>↗</span>
          </div>
          <span>🏷</span>
        </div>

        <div className="instagram-likes">Be the first to like this</div>

        {post.text && (
          <div className="instagram-caption">
            <span className="preview-username">{accountInfo.username}</span> {post.text}
          </div>
        )}

        <div className="preview-timestamp">Just now</div>
      </div>
    </div>

    <div className="instagram-nav">
      <span>🏠</span>
      <span>🔍</span>
      <span>➕</span>
      <span>🎬</span>
      <span>👤</span>
    </div>
  </div>
);

// Facebook Preview
export const FacebookPreview = ({ post, mediaPreview, mediaType, accountInfo, profileName: _profileName }) => (
  <div className="platform-preview facebook-preview">
    <div className="status-bar">
      <span className="status-time">9:41</span>
      <div className="status-icons">
        <span>📶</span>
        <span>📡</span>
        <span>🔋</span>
      </div>
    </div>

    <div className="facebook-header">
      <span className="header-icon">f</span>
      <div className="facebook-search">🔍 Search</div>
      <span>💬</span>
    </div>

    <div className="facebook-feed">
      <div className="facebook-post">
        <div className="facebook-post-header">
          <div className="facebook-profile">
            {accountInfo.profilePicture ? (
              <img src={accountInfo.profilePicture} alt="Profile" className="preview-avatar-img" />
            ) : (
              <div className="preview-avatar">👤</div>
            )}
            <div className="facebook-meta">
              <div className="preview-username">{accountInfo.username}</div>
              <div className="preview-timestamp">Just now · 🌍</div>
            </div>
          </div>
          <div className="preview-menu">⋯</div>
        </div>

        {post.text && (
          <div className="facebook-post-text">{post.text}</div>
        )}

        {mediaPreview && (
          <div className="facebook-post-media">
            {mediaType === "image" ? (
              <img src={mediaPreview} alt="Preview" />
            ) : (
              <video src={mediaPreview} controls />
            )}
          </div>
        )}

        <div className="facebook-post-actions">
          <button>👍 Like</button>
          <button>💬 Comment</button>
          <button>↪ Share</button>
        </div>
      </div>
    </div>

    <div className="facebook-nav">
      <span>🏠</span>
      <span>📺</span>
      <span>🏪</span>
      <span>👥</span>
      <span>🔔</span>
      <span>☰</span>
    </div>
  </div>
);

// Twitter/X Preview
export const TwitterPreview = ({ post, mediaPreview, mediaType, accountInfo }) => (
  <div className="platform-preview twitter-preview">
    <div className="status-bar dark">
      <span className="status-time">9:41</span>
      <div className="status-icons">
        <span>📶</span>
        <span>📡</span>
        <span>🔋</span>
      </div>
    </div>

    <div className="twitter-header">
      {accountInfo.profilePicture ? (
        <img src={accountInfo.profilePicture} alt="Profile" className="preview-avatar-img" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
      ) : (
        <div className="preview-avatar" style={{ width: '32px', height: '32px' }}>👤</div>
      )}
      <span className="twitter-logo">𝕏</span>
      <span>⚙️</span>
    </div>

    <div className="twitter-tabs">
      <span className="active">For you</span>
      <span>Following</span>
    </div>

    <div className="twitter-feed">
      <div className="twitter-tweet">
        <div className="tweet-avatar">
          {accountInfo.profilePicture ? (
            <img src={accountInfo.profilePicture} alt="Profile" className="preview-avatar-img" />
          ) : (
            <div className="preview-avatar">👤</div>
          )}
        </div>
        <div className="tweet-content">
          <div className="tweet-header">
            <span className="preview-username">{accountInfo.username}</span>
            <span className="tweet-handle">@{accountInfo.username.replace(/\s/g, '').toLowerCase()}</span>
            <span className="tweet-time">· now</span>
            <span className="tweet-more">⋯</span>
          </div>

          {post.text && (
            <div className="tweet-text">{post.text}</div>
          )}

          {mediaPreview && (
            <div className="tweet-media">
              {mediaType === "image" ? (
                <img src={mediaPreview} alt="Preview" />
              ) : (
                <video src={mediaPreview} controls />
              )}
            </div>
          )}

          <div className="tweet-actions">
            <span>💬 0</span>
            <span>🔁 0</span>
            <span>♡ 0</span>
            <span>📊</span>
            <span>↗</span>
          </div>
        </div>
      </div>
    </div>

    <div className="twitter-nav">
      <span>🏠</span>
      <span>🔍</span>
      <span>🔔</span>
      <span>✉️</span>
    </div>
  </div>
);

// LinkedIn Preview
export const LinkedInPreview = ({ post, mediaPreview, mediaType, accountInfo, profileName }) => (
  <div className="platform-preview linkedin-preview">
    <div className="status-bar">
      <span className="status-time">9:41</span>
      <div className="status-icons">
        <span>📶</span>
        <span>📡</span>
        <span>🔋</span>
      </div>
    </div>

    <div className="linkedin-header">
      <span className="linkedin-logo">in</span>
      <div className="linkedin-search">🔍 Search</div>
      <span>💬</span>
    </div>

    <div className="linkedin-feed">
      <div className="linkedin-post">
        <div className="linkedin-post-header">
          <div className="linkedin-profile">
            {accountInfo.profilePicture ? (
              <img src={accountInfo.profilePicture} alt="Profile" className="preview-avatar-img" />
            ) : (
              <div className="preview-avatar">👤</div>
            )}
            <div className="linkedin-meta">
              <div className="preview-username">{accountInfo.username}</div>
              <div className="linkedin-headline">{profileName || 'Your Business'}</div>
              <div className="preview-timestamp">Just now · 🌍</div>
            </div>
          </div>
          <div className="preview-menu">⋯</div>
        </div>

        {post.text && (
          <div className="linkedin-post-text">{post.text}</div>
        )}

        {mediaPreview && (
          <div className="linkedin-post-media">
            {mediaType === "image" ? (
              <img src={mediaPreview} alt="Preview" />
            ) : (
              <video src={mediaPreview} controls />
            )}
          </div>
        )}

        <div className="linkedin-post-stats">
          <span>Be the first to react</span>
        </div>

        <div className="linkedin-post-actions">
          <button>👍 Like</button>
          <button>💬 Comment</button>
          <button>🔁 Repost</button>
          <button>↗ Send</button>
        </div>
      </div>
    </div>

    <div className="linkedin-nav">
      <span>🏠<br/>Home</span>
      <span>👥<br/>Network</span>
      <span>➕<br/>Post</span>
      <span>🔔<br/>Notifications</span>
      <span>💼<br/>Jobs</span>
    </div>
  </div>
);

// Threads Preview
export const ThreadsPreview = ({ post, mediaPreview, mediaType, accountInfo }) => (
  <div className="platform-preview threads-preview">
    <div className="status-bar">
      <span className="status-time">9:41</span>
      <div className="status-icons">
        <span>📶</span>
        <span>📡</span>
        <span>🔋</span>
      </div>
    </div>

    <div className="threads-header">
      <span className="threads-logo">@</span>
      <div className="threads-header-icons">
        <span>♡</span>
      </div>
    </div>

    <div className="threads-feed">
      <div className="thread-post">
        <div className="thread-post-header">
          <div className="thread-profile">
            {accountInfo.profilePicture ? (
              <img src={accountInfo.profilePicture} alt="Profile" className="preview-avatar-img" />
            ) : (
              <div className="preview-avatar">👤</div>
            )}
            <div className="thread-meta">
              <span className="preview-username">{accountInfo.username}</span>
              <span className="thread-verified">✓</span>
            </div>
          </div>
          <div className="thread-time">now</div>
        </div>

        {post.text && (
          <div className="thread-text">{post.text}</div>
        )}

        {mediaPreview && (
          <div className="thread-media">
            {mediaType === "image" ? (
              <img src={mediaPreview} alt="Preview" />
            ) : (
              <video src={mediaPreview} controls />
            )}
          </div>
        )}

        <div className="thread-actions">
          <span>♡</span>
          <span>💬</span>
          <span>🔁</span>
          <span>↗</span>
        </div>
      </div>
    </div>

    <div className="threads-nav">
      <span>🏠</span>
      <span>🔍</span>
      <span>✏️</span>
      <span>♡</span>
      <span>👤</span>
    </div>
  </div>
);

// TikTok Preview
export const TikTokPreview = ({ post, mediaPreview, mediaType, accountInfo }) => (
  <div className="platform-preview tiktok-preview">
    <div className="status-bar dark">
      <span className="status-time">9:41</span>
      <div className="status-icons">
        <span>📶</span>
        <span>📡</span>
        <span>🔋</span>
      </div>
    </div>

    <div className="tiktok-header">
      <span>Live</span>
      <div className="tiktok-tabs">
        <span>Following</span>
        <span className="active">For You</span>
      </div>
      <span>🔍</span>
    </div>

    <div className="tiktok-content">
      {mediaPreview ? (
        mediaType === "image" ? (
          <img src={mediaPreview} alt="Preview" className="tiktok-media" />
        ) : (
          <video src={mediaPreview} className="tiktok-media" controls />
        )
      ) : (
        <div className="tiktok-placeholder">Your video will appear here</div>
      )}

      <div className="tiktok-sidebar">
        {accountInfo.profilePicture ? (
          <img src={accountInfo.profilePicture} alt="Profile" className="preview-avatar-img" style={{ width: '48px', height: '48px', borderRadius: '50%' }} />
        ) : (
          <div className="tiktok-avatar">👤</div>
        )}
        <span className="tiktok-action">♡<br/>0</span>
        <span className="tiktok-action">💬<br/>0</span>
        <span className="tiktok-action">🔖<br/>0</span>
        <span className="tiktok-action">↗<br/>0</span>
      </div>

      <div className="tiktok-info">
        <div className="tiktok-username">@{accountInfo.username.replace(/\s/g, '').toLowerCase()}</div>
        {post.text && <div className="tiktok-caption">{post.text}</div>}
      </div>
    </div>

    <div className="tiktok-nav">
      <span>🏠<br/>Home</span>
      <span>🔍<br/>Discover</span>
      <span className="tiktok-plus">➕</span>
      <span>📥<br/>Inbox</span>
      <span>👤<br/>Profile</span>
    </div>
  </div>
);

// YouTube Preview
export const YouTubePreview = ({ post, mediaPreview, mediaType, accountInfo }) => (
  <div className="platform-preview youtube-preview">
    <div className="status-bar">
      <span className="status-time">9:41</span>
      <div className="status-icons">
        <span>📶</span>
        <span>📡</span>
        <span>🔋</span>
      </div>
    </div>

    <div className="youtube-header">
      <span className="youtube-logo">▶️ YouTube</span>
      <div className="youtube-icons">
        <span>📺</span>
        <span>🔍</span>
        <span>👤</span>
      </div>
    </div>

    <div className="youtube-content">
      <div className="youtube-video">
        {mediaPreview ? (
          mediaType === "video" ? (
            <video src={mediaPreview} controls className="youtube-player" />
          ) : (
            <img src={mediaPreview} alt="Thumbnail" className="youtube-player" />
          )
        ) : (
          <div className="youtube-placeholder">Your video thumbnail</div>
        )}
      </div>

      <div className="youtube-info">
        <div className="youtube-title">{post.text ? post.text.substring(0, 60) : 'Your video title'}</div>
        <div className="youtube-meta">
          <span>{accountInfo.username}</span>
          <span>0 views · Just now</span>
        </div>
      </div>

      <div className="youtube-actions">
        <button>👍 Like</button>
        <button>👎 Dislike</button>
        <button>↗ Share</button>
        <button>💾 Save</button>
      </div>
    </div>

    <div className="youtube-nav">
      <span>🏠<br/>Home</span>
      <span>📺<br/>Shorts</span>
      <span>➕</span>
      <span>📚<br/>Subscriptions</span>
      <span>📖<br/>Library</span>
    </div>
  </div>
);

// Default/Generic Preview
export const GenericPreview = ({ post, mediaPreview, mediaType, accountInfo, platformName }) => (
  <div className="platform-preview generic-preview">
    <div className="status-bar">
      <span className="status-time">9:41</span>
      <div className="status-icons">
        <span>📶</span>
        <span>📡</span>
        <span>🔋</span>
      </div>
    </div>

    <div className="generic-header">
      <span className="header-title">{platformName}</span>
    </div>

    <div className="generic-content">
      <div className="generic-post">
        <div className="generic-post-header">
          {accountInfo.profilePicture ? (
            <img src={accountInfo.profilePicture} alt="Profile" className="preview-avatar-img" />
          ) : (
            <div className="preview-avatar">👤</div>
          )}
          <div className="generic-meta">
            <div className="preview-username">{accountInfo.username}</div>
            <div className="preview-timestamp">Just now</div>
          </div>
        </div>

        {post.text && (
          <div className="generic-text">{post.text}</div>
        )}

        {mediaPreview && (
          <div className="generic-media">
            {mediaType === "image" ? (
              <img src={mediaPreview} alt="Preview" />
            ) : (
              <video src={mediaPreview} controls />
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);

/**
 * PlatformPreview - Main component that renders the appropriate platform preview
 */
export const PlatformPreview = ({ platform, post, mediaPreview, mediaType, getAccountInfo, profileName }) => {
  const accountInfo = getAccountInfo(platform);

  switch (platform) {
    case "instagram":
      return <InstagramPreview post={post} mediaPreview={mediaPreview} mediaType={mediaType} accountInfo={accountInfo} profileName={profileName} />;
    case "facebook":
      return <FacebookPreview post={post} mediaPreview={mediaPreview} mediaType={mediaType} accountInfo={accountInfo} profileName={profileName} />;
    case "twitter":
      return <TwitterPreview post={post} mediaPreview={mediaPreview} mediaType={mediaType} accountInfo={accountInfo} />;
    case "linkedin":
      return <LinkedInPreview post={post} mediaPreview={mediaPreview} mediaType={mediaType} accountInfo={accountInfo} profileName={profileName} />;
    case "threads":
      return <ThreadsPreview post={post} mediaPreview={mediaPreview} mediaType={mediaType} accountInfo={accountInfo} />;
    case "tiktok":
      return <TikTokPreview post={post} mediaPreview={mediaPreview} mediaType={mediaType} accountInfo={accountInfo} />;
    case "youtube":
      return <YouTubePreview post={post} mediaPreview={mediaPreview} mediaType={mediaType} accountInfo={accountInfo} />;
    default:
      return <GenericPreview post={post} mediaPreview={mediaPreview} mediaType={mediaType} accountInfo={accountInfo} platformName={platform} />;
  }
};

export default PlatformPreview;
