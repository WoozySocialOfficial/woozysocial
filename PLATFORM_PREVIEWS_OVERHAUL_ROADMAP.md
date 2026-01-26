# Platform Previews Complete Overhaul - Roadmap

## Executive Summary
Complete redesign of all social media platform previews to achieve pixel-perfect accuracy with proper multi-image carousel support, authentic icons, and realistic UI/UX interactions.

---

## Current Issues

### Visual Problems:
- ❌ Using emoji icons instead of actual platform icons
- ❌ Generic styling that doesn't match platform aesthetics
- ❌ Incorrect fonts, colors, and spacing
- ❌ No carousel/multi-image support
- ❌ No platform-specific interaction patterns
- ❌ Status bar icons are emojis (not realistic)

### Functional Problems:
- ❌ Only shows first image (`mediaPreview` is single value)
- ❌ No carousel navigation (dots, arrows)
- ❌ No image counter (e.g., "1/4")
- ❌ Missing platform-specific features (Stories, Reels indicators)

---

## Architecture Changes

### Current Props (Single Image):
```javascript
{
  post: { text, media },
  mediaPreview: "data:url...",  // Single image
  mediaType: "image" | "video",
  accountInfo: { username, profilePicture }
}
```

### New Props (Multi-Image):
```javascript
{
  post: { text, media: [] },
  mediaPreviews: [               // Array of media
    { id, dataUrl, type, order }
  ],
  accountInfo: { username, profilePicture, verified },
  platform: "instagram" | "facebook" | ...
}
```

---

## Implementation Plan

## Phase 1: Foundation & Assets (Day 1)

### 1.1 Install Icon Library
```bash
npm install react-icons
```
- Provides Font Awesome, Material Icons, Simple Icons
- Or use SVG files from official brand kits

### 1.2 Create Icon Components
**File**: `src/components/compose/PlatformIcons.jsx`

```javascript
import {
  FaInstagram, FaFacebookF, FaLinkedinIn,
  FaYoutube, FaTiktok, FaReddit, FaPinterest
} from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { SiThreads, SiBluesky, SiSnapchat } from 'react-icons/si';

export const PlatformIcons = {
  instagram: <FaInstagram />,
  facebook: <FaFacebookF />,
  twitter: <FaXTwitter />,
  linkedin: <FaLinkedinIn />,
  youtube: <FaYoutube />,
  tiktok: <FaTiktok />,
  threads: <SiThreads />,
  // ... etc
};
```

### 1.3 Create Carousel Component
**File**: `src/components/compose/MediaCarousel.jsx`

```javascript
import React, { useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

export const MediaCarousel = ({
  media,
  platform,
  showControls = true,
  showIndicators = true
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () => setCurrentIndex((prev) =>
    (prev + 1) % media.length
  );

  const prev = () => setCurrentIndex((prev) =>
    prev === 0 ? media.length - 1 : prev - 1
  );

  const currentMedia = media[currentIndex];

  return (
    <div className="media-carousel">
      {/* Current media */}
      <div className="carousel-media">
        {currentMedia.type === 'image' ? (
          <img src={currentMedia.dataUrl} alt={`Media ${currentIndex + 1}`} />
        ) : (
          <video src={currentMedia.dataUrl} controls />
        )}
      </div>

      {/* Navigation arrows (only if multiple items) */}
      {media.length > 1 && showControls && (
        <>
          <button
            className="carousel-btn carousel-prev"
            onClick={prev}
            aria-label="Previous image"
          >
            <FaChevronLeft />
          </button>
          <button
            className="carousel-btn carousel-next"
            onClick={next}
            aria-label="Next image"
          >
            <FaChevronRight />
          </button>
        </>
      )}

      {/* Indicators */}
      {media.length > 1 && showIndicators && (
        <div className={`carousel-indicators ${platform}`}>
          {media.map((_, idx) => (
            <span
              key={idx}
              className={`indicator ${idx === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(idx)}
            />
          ))}
        </div>
      )}

      {/* Counter (for some platforms) */}
      {media.length > 1 && platform === 'instagram' && (
        <div className="carousel-counter">
          {currentIndex + 1}/{media.length}
        </div>
      )}
    </div>
  );
};
```

---

## Phase 2: Instagram Preview (Day 2)

### Design Specs:
- **Font**: SF Pro Display (iOS system font)
- **Colors**:
  - Background: #FFFFFF
  - Text: #000000
  - Secondary text: #8E8E93
  - Like/Action: #262626
  - Link: #0095F6
- **Spacing**: 12px padding, 8px gaps
- **Avatar**: 32px circle
- **Icons**: 24px size

### Features:
✅ Story ring around avatar (gradient)
✅ Verified badge (blue checkmark)
✅ Carousel dots (white with shadow)
✅ Image counter (top-right, e.g., "1/4")
✅ Multiple images grid layout option
✅ Heart/Comment/Share/Save icons (proper SVGs)
✅ "Liked by X and Y others" text
✅ Caption with "more" expansion

### Implementation:
**File**: `src/components/compose/previews/InstagramPreview.jsx`

```javascript
import React, { useState } from 'react';
import { MediaCarousel } from '../MediaCarousel';
import {
  AiOutlineHeart, AiOutlineComment,
  AiOutlineSend, AiOutlineMore
} from 'react-icons/ai';
import { BsBookmark } from 'react-icons/bs';
import { MdVerified } from 'react-icons/md';

export const InstagramPreview = ({ post, mediaPreviews, accountInfo }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [showFullCaption, setShowFullCaption] = useState(false);

  const truncateCaption = (text, maxLength = 125) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="instagram-preview-v2">
      {/* Status Bar */}
      <div className="ig-status-bar">
        <span className="time">9:41</span>
        <div className="status-icons">
          {/* Use actual icon library or SVGs */}
          <CellularIcon />
          <WifiIcon />
          <BatteryIcon />
        </div>
      </div>

      {/* App Header */}
      <div className="ig-header">
        <svg className="ig-logo" width="105" height="29" viewBox="0 0 105 29">
          {/* Instagram wordmark SVG path */}
        </svg>
        <div className="ig-header-icons">
          <AiOutlineHeart size={24} />
          <AiOutlineComment size={24} style={{ transform: 'scaleX(-1)' }} />
        </div>
      </div>

      {/* Feed Post */}
      <div className="ig-post">
        {/* Post Header */}
        <div className="ig-post-header">
          <div className="ig-profile-section">
            <div className="ig-avatar-container">
              {/* Story ring gradient */}
              <div className="ig-story-ring">
                <img
                  src={accountInfo.profilePicture || '/default-avatar.png'}
                  alt={accountInfo.username}
                  className="ig-avatar"
                />
              </div>
            </div>
            <div className="ig-username-section">
              <span className="ig-username">
                {accountInfo.username}
                {accountInfo.verified && <MdVerified className="ig-verified" />}
              </span>
            </div>
          </div>
          <AiOutlineMore size={20} />
        </div>

        {/* Media Carousel */}
        {mediaPreviews && mediaPreviews.length > 0 && (
          <MediaCarousel
            media={mediaPreviews}
            platform="instagram"
            showControls={false}  // Instagram uses swipe, not arrows
            showIndicators={true}
          />
        )}

        {/* Actions */}
        <div className="ig-actions">
          <div className="ig-actions-left">
            <button
              onClick={() => setIsLiked(!isLiked)}
              className="ig-action-btn"
            >
              {isLiked ? (
                <AiFillHeart size={24} color="#ED4956" />
              ) : (
                <AiOutlineHeart size={24} />
              )}
            </button>
            <button className="ig-action-btn">
              <AiOutlineComment size={24} style={{ transform: 'scaleX(-1)' }} />
            </button>
            <button className="ig-action-btn">
              <AiOutlineSend size={24} />
            </button>
          </div>
          <button className="ig-action-btn">
            <BsBookmark size={20} />
          </button>
        </div>

        {/* Likes */}
        <div className="ig-likes">
          <span>Be the first to like this</span>
        </div>

        {/* Caption */}
        {post.text && (
          <div className="ig-caption">
            <span className="ig-caption-username">{accountInfo.username}</span>
            {' '}
            <span className="ig-caption-text">
              {showFullCaption ? post.text : truncateCaption(post.text)}
              {post.text.length > 125 && (
                <button
                  className="ig-caption-more"
                  onClick={() => setShowFullCaption(!showFullCaption)}
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

      {/* Bottom Navigation */}
      <div className="ig-nav">
        <HomeIcon active />
        <SearchIcon />
        <PlusIcon />
        <ReelsIcon />
        <ProfileIcon />
      </div>
    </div>
  );
};
```

### CSS:
**File**: `src/components/compose/previews/InstagramPreview.css`

```css
.instagram-preview-v2 {
  width: 375px;
  height: 812px;
  background: #FFFFFF;
  border-radius: 40px;
  border: 12px solid #1F1F1F;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.ig-status-bar {
  height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  background: #FFFFFF;
}

.ig-header {
  height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  border-bottom: 0.5px solid #DBDBDB;
}

.ig-post {
  background: #FFFFFF;
}

.ig-post-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
}

.ig-profile-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ig-story-ring {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(45deg, #F58529, #DD2A7B, #8134AF, #515BD4);
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ig-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #FFFFFF;
  object-fit: cover;
}

.ig-username {
  font-size: 14px;
  font-weight: 600;
  color: #262626;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ig-verified {
  color: #0095F6;
  font-size: 14px;
}

/* Carousel indicators specific to Instagram */}
.carousel-indicators.instagram {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
}

.carousel-indicators.instagram .indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.carousel-indicators.instagram .indicator.active {
  background: #FFFFFF;
  width: 8px;
  height: 8px;
}

.ig-actions {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
}

.ig-actions-left {
  display: flex;
  gap: 16px;
}

.ig-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: #262626;
  transition: opacity 0.2s;
}

.ig-action-btn:hover {
  opacity: 0.6;
}

.ig-likes {
  padding: 0 16px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #262626;
}

.ig-caption {
  padding: 0 16px;
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 18px;
  color: #262626;
}

.ig-caption-username {
  font-weight: 600;
}

.ig-caption-more {
  color: #8E8E93;
  background: none;
  border: none;
  padding: 0;
  font-size: 14px;
  cursor: pointer;
}

.ig-timestamp {
  padding: 0 16px;
  margin-bottom: 12px;
  font-size: 10px;
  color: #8E8E93;
  text-transform: uppercase;
  letter-spacing: 0.2px;
}

.ig-nav {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50px;
  background: #FFFFFF;
  border-top: 0.5px solid #DBDBDB;
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding-bottom: 20px; /* Safe area for iPhone notch */
}
```

---

## Phase 3: Twitter/X Preview (Day 3)

### Design Specs:
- **Font**: Chirp (Twitter's custom font), fallback to SF Pro
- **Colors**:
  - Background: #000000 (dark mode) or #FFFFFF (light mode)
  - Text: #E7E9EA (dark) or #0F1419 (light)
  - Blue: #1D9BF0
  - Secondary: #536471 (dark) or #536471 (light)
- **Layout**: Full-width tweets, 16px padding
- **Avatar**: 40px circle

### Features:
✅ Dark mode toggle
✅ "For You" / "Following" tabs
✅ Verified badge (gold/blue)
✅ Multi-image grid layouts:
  - 1 image: Full width
  - 2 images: Side by side
  - 3 images: 1 large + 2 stacked
  - 4 images: 2x2 grid
✅ Retweet/Like/Reply/Share buttons with counts
✅ Thread indicator (if multiple tweets)
✅ Poll option (if poll data provided)

### Multi-Image Grid Logic:
```javascript
const TwitterMediaGrid = ({ media }) => {
  const count = media.length;

  if (count === 1) {
    return <div className="twitter-media-single">{/* Full width */}</div>;
  }

  if (count === 2) {
    return (
      <div className="twitter-media-dual">
        {media.map((m, i) => <div key={i}>{/* 50% width each */}</div>)}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="twitter-media-triple">
        <div className="twitter-media-main">{media[0]}</div>
        <div className="twitter-media-side">
          <div>{media[1]}</div>
          <div>{media[2]}</div>
        </div>
      </div>
    );
  }

  if (count === 4) {
    return (
      <div className="twitter-media-quad">
        {media.map((m, i) => <div key={i}>{/* 50% x 50% grid */}</div>)}
      </div>
    );
  }

  return null;
};
```

---

## Phase 4: Facebook Preview (Day 4)

### Design Specs:
- **Font**: Segoe UI, Helvetica Neue, Arial
- **Colors**:
  - Background: #F0F2F5
  - Card: #FFFFFF
  - Primary Blue: #1877F2
  - Text: #050505
  - Secondary: #65676B
- **Spacing**: 12px padding on cards

### Features:
✅ Collapsible post text ("See more")
✅ Multi-image collage layouts (similar to Twitter but different UI)
✅ Like/Comment/Share buttons
✅ Reaction emoji bar
✅ "You and 42 others" likes text
✅ Comment preview section

---

## Phase 5: LinkedIn Preview (Day 5)

### Design Specs:
- **Font**: LinkedIn's custom font, fallback to SF Pro
- **Colors**:
  - Background: #F3F2EF
  - Card: #FFFFFF
  - LinkedIn Blue: #0A66C2
  - Text: rgba(0, 0, 0, 0.9)
  - Secondary: rgba(0, 0, 0, 0.6)
- **Layout**: Professional, spacious

### Features:
✅ Headline/Title under username
✅ Company logo next to name
✅ Connection degree ("2nd" badge)
✅ Post visibility icon (globe/connections)
✅ Like/Comment/Repost/Send buttons
✅ Reaction types (Like, Celebrate, Support, Love, Insightful, Curious)
✅ "X people reacted" bar
✅ Carousel navigation arrows visible

---

## Phase 6: TikTok Preview (Day 6)

### Design Specs:
- **Font**: Proxima Nova
- **Colors**:
  - Background: #000000
  - Text: #FFFFFF
  - Pink: #FE2C55
  - Blue: #00F2EA
- **Layout**: Full screen vertical video

### Features:
✅ Full-screen media preview
✅ Overlay caption at bottom
✅ Right sidebar with actions:
  - Profile pic
  - Like (heart)
  - Comment
  - Share
  - Sound icon
✅ "For You" page indicator
✅ Scrolling hashtags
✅ Sound credit with rotating disc icon

---

## Phase 7: Threads & Others (Day 7)

### Threads:
- Similar to Twitter but Meta-styled
- Simpler UI
- Thread chain indicators

### YouTube:
- Video player with controls
- Title, description, channel info
- Like/Dislike/Share/Save bar
- Comment section preview

### Pinterest:
- Pin board layout
- Save button overlay
- Related pins sidebar

---

## Phase 8: Responsive & Polish (Day 8)

### Responsive Breakpoints:
```css
@media (max-width: 768px) {
  .platform-preview {
    width: 100%;
    max-width: 375px;
    height: auto;
    border-radius: 20px;
    border-width: 6px;
  }
}

@media (max-width: 480px) {
  .platform-preview {
    border-radius: 0;
    border-width: 0;
  }
}
```

### Accessibility:
- ARIA labels on all interactive elements
- Keyboard navigation support
- Screen reader announcements
- Focus visible states

---

## Phase 9: Update ComposeContent Integration

### Update Props Passed to Preview:
**File**: `src/components/ComposeContent.jsx` (lines 696+)

```javascript
// BEFORE:
<PlatformPreview
  platform={selectedPreview}
  post={post}
  mediaPreview={mediaPreview}
  mediaType={mediaType}
  getAccountInfo={getAccountInfo}
  profileName={activeWorkspace?.name}
/>

// AFTER:
<PlatformPreview
  platform={selectedPreview}
  post={post}
  mediaPreviews={mediaPreviews}  // Array of media objects
  getAccountInfo={getAccountInfo}
  profileName={activeWorkspace?.name}
/>
```

---

## File Structure

```
src/components/compose/
├── MediaCarousel.jsx              (NEW - Shared carousel)
├── MediaCarousel.css
├── PlatformIcons.jsx              (NEW - Icon library)
├── previews/                      (NEW - Organized by platform)
│   ├── InstagramPreview.jsx
│   ├── InstagramPreview.css
│   ├── TwitterPreview.jsx
│   ├── TwitterPreview.css
│   ├── FacebookPreview.jsx
│   ├── FacebookPreview.css
│   ├── LinkedInPreview.jsx
│   ├── LinkedInPreview.css
│   ├── TikTokPreview.jsx
│   ├── TikTokPreview.css
│   ├── ThreadsPreview.jsx
│   ├── ThreadsPreview.css
│   ├── YouTubePreview.jsx
│   ├── YouTubePreview.css
│   └── index.js                   (Export all previews)
└── PlatformPreviews.jsx           (OLD - To be deprecated)
```

---

## Testing Checklist

### For Each Platform:
- [ ] Single image displays correctly
- [ ] Multiple images show carousel/grid
- [ ] Carousel navigation works (swipe/click)
- [ ] Indicators show correct active state
- [ ] Image counter displays for 2+ images
- [ ] Icons are authentic (not emojis)
- [ ] Colors match platform brand
- [ ] Fonts are accurate
- [ ] Spacing and proportions correct
- [ ] Responsive on mobile
- [ ] Accessible (keyboard nav, ARIA)
- [ ] Dark mode (if applicable)

### Multi-Image Layouts:
- [ ] Instagram: Carousel with dots
- [ ] Twitter: Grid layouts (1/2/3/4 images)
- [ ] Facebook: Collage layouts
- [ ] LinkedIn: Carousel with arrows
- [ ] TikTok: Slideshow with swipe
- [ ] Others: Default carousel

---

## Performance Optimizations

### Lazy Loading:
```javascript
const InstagramPreview = React.lazy(() =>
  import('./previews/InstagramPreview')
);

// Usage:
<Suspense fallback={<PreviewSkeleton />}>
  <InstagramPreview {...props} />
</Suspense>
```

### Image Optimization:
- Use `loading="lazy"` on images
- Compress preview images to max 500KB
- Use WebP format where supported
- Implement placeholder blur effect

### Code Splitting:
- Each platform preview in separate file
- Lazy load only the selected platform
- Shared carousel component

---

## Brand Assets

### Where to Get Authentic Icons:
1. **Official Brand Kits**:
   - Instagram: https://about.instagram.com/brand
   - Facebook: https://about.meta.com/brand/resources/
   - Twitter: https://about.twitter.com/en/who-we-are/brand-toolkit
   - LinkedIn: https://brand.linkedin.com/
   - TikTok: https://www.tiktok.com/about/brand-guidelines

2. **Icon Libraries**:
   - react-icons (Font Awesome, Simple Icons)
   - @iconify/react (comprehensive)
   - Custom SVG from brand kits

3. **Fonts**:
   - Instagram: SF Pro Display (iOS system)
   - Twitter: Chirp (fallback to SF Pro)
   - Facebook: Segoe UI, Helvetica
   - LinkedIn: LinkedIn Sans (fallback to SF Pro)
   - TikTok: Proxima Nova

---

## Migration Strategy

### Week 1: Infrastructure
- Day 1: Install dependencies, create carousel
- Day 2-3: Build Instagram preview (most complex)
- Day 4: Twitter/X preview
- Day 5: Test and refine first two platforms

### Week 2: Remaining Platforms
- Day 6: Facebook + LinkedIn
- Day 7: TikTok + Threads
- Day 8: YouTube + others
- Day 9: Responsive design
- Day 10: Accessibility audit

### Week 3: Integration & Testing
- Day 11-12: Update ComposeContent integration
- Day 13-14: Cross-browser testing
- Day 15: Performance optimization
- Day 16: User acceptance testing
- Day 17: Bug fixes
- Day 18: Documentation
- Day 19-20: Production deployment

---

## Success Metrics

### Visual Accuracy:
- [ ] 95%+ match to actual platform UI
- [ ] All icons authentic (no emojis)
- [ ] Correct fonts and colors
- [ ] Proper spacing and proportions

### Functionality:
- [ ] Carousel works smoothly on all platforms
- [ ] Multi-image grids render correctly
- [ ] All interactions functional
- [ ] No performance degradation

### User Experience:
- [ ] Previews load < 500ms
- [ ] Smooth animations (60fps)
- [ ] Responsive on all devices
- [ ] Accessible (WCAG AA)

---

## Priority Order

### Must-Have (MVP):
1. ✅ Instagram (carousel with dots)
2. ✅ Twitter/X (grid layouts)
3. ✅ Facebook (collage)
4. ✅ LinkedIn (carousel with arrows)

### Should-Have:
5. ✅ TikTok (full-screen)
6. ✅ Threads (simple feed)

### Nice-to-Have:
7. ⭕ YouTube
8. ⭕ Pinterest
9. ⭕ Reddit
10. ⭕ Snapchat

---

## Dependencies

### Required Packages:
```json
{
  "react-icons": "^5.0.1",
  "framer-motion": "^11.0.0",  // For smooth animations
  "@iconify/react": "^4.1.1",   // Additional icons
  "react-use-gesture": "^9.1.3" // Swipe gestures
}
```

### Optional:
- `swiper` - Professional carousel library
- `react-spring` - Advanced animations
- `intersection-observer` - Lazy loading

---

## Next Steps

1. **Get approval** on this roadmap
2. **Create branch**: `feature/platform-previews-v2`
3. **Install dependencies**
4. **Start with Instagram** (most complex, sets the pattern)
5. **Iterate and refine**
6. **Weekly demos** to stakeholders

---

## Questions to Answer Before Starting

1. Do we want dark mode support for all platforms?
2. Should previews be interactive (clickable likes/comments)?
3. Do we need animation for like/react actions?
4. Should we show verified badges if account isn't verified?
5. Do we want to show "draft" watermark on previews?
6. Should carousel auto-advance or manual only?
7. Do we need preview export (screenshot) functionality?

---

## Reference Screenshots

For pixel-perfect implementation, capture reference screenshots from:
- Real Instagram posts (iOS app)
- Real Twitter posts (dark mode)
- Real Facebook posts (desktop + mobile)
- Real LinkedIn posts (web app)
- Real TikTok videos (mobile app)

Store in: `docs/design/platform-references/`

---

**Created**: January 26, 2026
**Author**: Claude Sonnet 4.5
**Status**: Ready for Implementation 🚀
