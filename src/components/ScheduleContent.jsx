import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL, hasFeature } from "../utils/constants";
import { useUnifiedSchedule, useInvalidateQueries } from "../hooks/useQueries";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaCheck, FaTimes, FaComment, FaClock } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { SiX } from "react-icons/si";
import { formatTimeInTimezone, formatDateOnlyInTimezone } from "../utils/timezones";
import { SubscriptionGuard } from "./subscription/SubscriptionGuard";
import { PostDetailPanel } from "./comments/PostDetailPanel";
import { LoadingContainer } from "./ui/LoadingSpinner";
import "./ScheduleContent.css";

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  twitter: SiX,
  "x/twitter": SiX,
};

const APPROVAL_STATUS = {
  pending: { label: 'Pending', color: '#f59e0b', icon: FaClock },
  approved: { label: 'Approved', color: '#10b981', icon: FaCheck },
  rejected: { label: 'Rejected', color: '#ef4444', icon: FaTimes },
};

export const ScheduleContent = () => {
  const { user, profile, hasActiveProfile, subscriptionStatus, subscriptionTier, isWhitelisted } = useAuth();
  const { activeWorkspace, workspaceMembership } = useWorkspace();

  // Check if user has access (multi-workspace support)
  // User has access if: active profile, whitelisted, active subscription, or workspace has profile
  const workspaceHasProfile = !!activeWorkspace?.ayr_profile_key;
  const canPost = hasActiveProfile ||
    isWhitelisted ||
    profile?.is_whitelisted ||
    subscriptionStatus === 'active' ||
    workspaceHasProfile;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("week"); // week, month, schedule
  const [approvalFilter, setApprovalFilter] = useState("all"); // all, pending, approved, rejected
  const [selectedPost, setSelectedPost] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { invalidatePosts } = useInvalidateQueries();

  // Check if user is a client (can approve/reject)
  const isClient = workspaceMembership?.role === 'client';
  const canApprove = isClient || workspaceMembership?.role === 'owner' || workspaceMembership?.role === 'admin';

  // Check if subscription tier has approval workflows feature
  const hasApprovalWorkflows = hasFeature(subscriptionTier, 'approvalWorkflows');

  // Use React Query for unified schedule data
  const {
    data: posts = [],
    isLoading: loading,
    refetch: refetchPosts
  } = useUnifiedSchedule(activeWorkspace?.id, user?.id, "all");

  // Refresh function that invalidates cache
  const fetchPosts = () => {
    invalidatePosts(activeWorkspace?.id);
    refetchPosts();
  };

  // Handle post approval
  const handleApproval = async (postId, action, commentText = "") => {
    if (!activeWorkspace) return;

    setActionLoading(true);
    try {
      const response = await fetch(`${baseURL}/api/post/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          workspaceId: activeWorkspace.id,
          userId: user.id,
          action,
          comment: commentText,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update approval');
      }

      // Refresh posts using cached query
      fetchPosts();
      setSelectedPost(null);
    } catch (error) {
      console.error('Error updating approval:', error);
      alert(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Wrapper functions for PostDetailPanel
  const handleApprove = async (postId) => {
    await handleApproval(postId, 'approve');
    setSelectedPost(null);
  };

  const handleReject = async (postId) => {
    await handleApproval(postId, 'reject');
    setSelectedPost(null);
  };

  const handleRequestChanges = async (postId) => {
    await handleApproval(postId, 'changes_requested');
    setSelectedPost(null);
  };

  const handleEditScheduledPost = (post) => {
    // Navigate to Compose page to edit the scheduled post
    // Store post data in sessionStorage for loading in Compose
    sessionStorage.setItem("loadDraft", JSON.stringify({
      id: post.id,
      content: post.caption || post.content || post.post,
      caption: post.caption || post.content || post.post,
      media_urls: post.media_urls || post.mediaUrls || [],
      platforms: post.platforms || [],
      scheduled_date: post.scheduled_at || post.scheduleDate || post.schedule_date,
      workspace_id: activeWorkspace.id,
      isEditingScheduledPost: true // Flag to indicate this is editing a scheduled post
    }));
    setSelectedPost(null);
    // Navigate to compose - you'll need to import useNavigate from react-router-dom
    window.location.href = '/compose';
  };

  // Filter posts by approval status AND auto-remove rejected posts older than 7 days
  const filteredPosts = posts.filter(post => {
    // Remove rejected posts older than 7 days from display
    if (post.approvalStatus === 'rejected') {
      const postDate = new Date(post.scheduleDate || post.created_at);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // If rejected post is older than 7 days, hide it
      if (postDate < sevenDaysAgo) {
        return false;
      }
    }

    // Apply approval filter
    if (approvalFilter === 'all') return true;
    return post.approvalStatus === approvalFilter;
  });

  // Get week dates
  const getWeekDates = () => {
    const dates = [];
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  // Get month dates
  const getMonthDates = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(firstDay.getDate() - firstDay.getDay());

    const dates = [];
    const currentDateIter = new Date(startDate);

    while (currentDateIter <= lastDay || dates.length < 35) {
      dates.push(new Date(currentDateIter));
      currentDateIter.setDate(currentDateIter.getDate() + 1);
    }

    return dates;
  };

  // Navigate dates
  const navigateWeek = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentDate(newDate);
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  // Get posts for a specific date and time
  const getPostsForSlot = (date, hour) => {
    return filteredPosts.filter(post => {
      if (!post.scheduleDate) return false;
      const postDate = new Date(post.scheduleDate);

      // Compare dates in local time
      const postYear = postDate.getFullYear();
      const postMonth = postDate.getMonth();
      const postDay = postDate.getDate();
      const postHour = postDate.getHours();

      const slotYear = date.getFullYear();
      const slotMonth = date.getMonth();
      const slotDay = date.getDate();

      return (
        postYear === slotYear &&
        postMonth === slotMonth &&
        postDay === slotDay &&
        postHour === hour
      );
    });
  };

  // Get posts for a specific date (for month/kanban view)
  const getPostsForDate = (date) => {
    return filteredPosts.filter(post => {
      if (!post.scheduleDate) return false;
      const postDate = new Date(post.scheduleDate);
      return (
        postDate.getFullYear() === date.getFullYear() &&
        postDate.getMonth() === date.getMonth() &&
        postDate.getDate() === date.getDate()
      );
    });
  };

  // Group posts by date for Schedule view
  const getPostsByDate = () => {
    const grouped = {};

    filteredPosts.forEach(post => {
      if (post.scheduleDate) {
        const dateKey = formatDateOnlyInTimezone(post.scheduleDate, activeWorkspace?.timezone || 'UTC');

        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(post);
      }
    });

    // Sort posts within each date by time
    Object.keys(grouped).forEach(dateKey => {
      grouped[dateKey].sort((a, b) => a.scheduleDate - b.scheduleDate);
    });

    // Convert to array and sort by date
    return Object.entries(grouped)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]));
  };

  // Auto-scroll to current date in schedule view
  useEffect(() => {
    if (view === 'schedule' && !loading) {
      const today = formatDateOnlyInTimezone(new Date(), activeWorkspace?.timezone || 'UTC');
      const todaySection = document.querySelector(`[data-date="${today}"]`);

      if (todaySection) {
        // Scroll to today's section with some offset
        setTimeout(() => {
          todaySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }, [view, loading, activeWorkspace?.timezone]);

  const weekDates = getWeekDates();
  const monthDates = getMonthDates();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const timeSlots = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM

  // Check if post is in the past (before today)
  const isPostInPast = (scheduleDate) => {
    if (!scheduleDate) return false;
    const postDate = new Date(scheduleDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    postDate.setHours(0, 0, 0, 0); // Start of post day
    return postDate < today;
  };

  // Render Post Card - Compact, click opens modal
  const renderPostCard = (post) => {
    const approvalInfo = APPROVAL_STATUS[post.approvalStatus] || APPROVAL_STATUS.pending;
    const ApprovalIcon = approvalInfo.icon;
    const isPast = isPostInPast(post.scheduleDate);

    return (
      <div
        key={post.id}
        className={`post-card ${post.status === "success" ? "published" : "scheduled"} approval-${post.approvalStatus} ${isPast ? 'past-post' : ''}`}
        onClick={() => {
          // Normalize post structure for PostDetailPanel
          const normalizedPost = {
            ...post,
            id: post.id,
            workspace_id: activeWorkspace.id,
            caption: post.content || post.post,
            media_urls: post.mediaUrls || [],
            platforms: post.platforms || [],
            scheduled_at: post.scheduleDate || post.schedule_date,
            status: post.status || 'scheduled',
            approval_status: post.approvalStatus
          };
          setSelectedPost(normalizedPost);
        }}
        title="Click to view details"
      >
        <div className="post-card-header">
          {/* Only show approval badge if tier has approval workflows */}
          {hasApprovalWorkflows && (
            <div className="post-approval-badge" style={{ backgroundColor: approvalInfo.color }}>
              <ApprovalIcon size={11} />
              <span>{approvalInfo.label}</span>
            </div>
          )}
          {(post.comments?.length > 0 || post.commentCount > 0) && (
            <div className="post-comment-count" title={`${post.comments?.length || post.commentCount} comment(s)`}>
              <FaComment size={10} />
              <span>{post.comments?.length || post.commentCount}</span>
            </div>
          )}
        </div>
        <div className="post-card-content">
          {post.content.substring(0, 80)}{post.content.length > 80 && "..."}
        </div>
        <div className="post-card-footer">
          <div className="post-platforms">
            {post.platforms.slice(0, 3).map((platform, idx) => {
              const PlatformIcon = PLATFORM_ICONS[platform?.toLowerCase()];
              return PlatformIcon ? <PlatformIcon key={idx} size={14} /> : null;
            })}
            {post.platforms.length > 3 && <span className="platform-more">+{post.platforms.length - 3}</span>}
          </div>
          <span className="post-time">
            {formatTimeInTimezone(post.scheduleDate, activeWorkspace?.timezone || 'UTC')}
          </span>
        </div>
      </div>
    );
  };

  // Week View
  const renderWeekView = () => {
    // Calculate the maximum number of posts for each hour across all days
    const hourPostCounts = {};
    timeSlots.forEach(hour => {
      let maxPosts = 0;
      weekDates.forEach(date => {
        const postsInSlot = getPostsForSlot(date, hour).length;
        if (postsInSlot > maxPosts) {
          maxPosts = postsInSlot;
        }
      });
      hourPostCounts[hour] = maxPosts;
    });

    // Calculate dynamic height for each hour slot
    // Each post card is approximately 90-100px tall (larger for readability)
    const getSlotHeight = (hour) => {
      const postCount = hourPostCounts[hour];
      if (postCount === 0) return 80;
      // Base padding (35px) + (95px per card with all content visible + gap)
      // This ensures cards are large enough to show caption, time, and platforms
      return Math.max(80, 35 + (postCount * 95));
    };

    return (
      <div className="week-view">
        {/* Sticky header cells - part of the same flat grid */}
        <div className="time-header"></div>
        {weekDates.map((date, dayIndex) => (
          <div key={`header-${dayIndex}`} className="day-header">
            <div className="day-name">{dayNames[date.getDay()]}</div>
            <div className="day-date">
              {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </div>
        ))}

        {/* Body cells - time slots and schedule cells in one flat grid */}
        {timeSlots.map((hour) => {
          const slotHeight = getSlotHeight(hour);
          return (
            <React.Fragment key={hour}>
              <div
                className="time-slot"
                style={{ height: `${slotHeight}px` }}
              >
                {hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}
              </div>
              {weekDates.map((date, dayIndex) => {
                const slotPosts = getPostsForSlot(date, hour);
                const visiblePosts = slotPosts.slice(0, 2);
                const remainingCount = slotPosts.length - 2;

                return (
                  <div
                    key={dayIndex}
                    className="schedule-cell"
                    style={{ height: `${slotHeight}px` }}
                  >
                    {visiblePosts.map(renderPostCard)}
                    {remainingCount > 0 && (
                      <div
                        className="more-posts-indicator"
                        title={`${remainingCount} more post${remainingCount !== 1 ? 's' : ''} at this time. Click to view all.`}
                      >
                        +{remainingCount} more
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // Month View
  const renderMonthView = () => (
    <div className="month-view">
      <div className="month-grid">
        {dayNames.map(day => (
          <div key={day} className="month-day-header">{day}</div>
        ))}
        {monthDates.map((date, index) => {
          const datePosts = getPostsForDate(date);
          const isCurrentMonth = date.getMonth() === currentDate.getMonth();

          return (
            <div
              key={index}
              className={`month-cell ${!isCurrentMonth ? 'other-month' : ''}`}
            >
              <div className="month-date">{date.getDate()}</div>
              <div className="month-posts">
                {datePosts.slice(0, 3).map(renderPostCard)}
                {datePosts.length > 3 && (
                  <div className="more-posts">+{datePosts.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Schedule View (grouped by date)
  const renderScheduleView = () => {
    const postsByDate = getPostsByDate();

    if (postsByDate.length === 0) {
      return (
        <div className="schedule-empty">
          <p>No scheduled posts found.</p>
        </div>
      );
    }

    return (
      <div className="schedule-list-view">
        {postsByDate.map(([dateKey, datePosts]) => (
          <div key={dateKey} className="schedule-day-section" data-date={dateKey}>
            <div className="schedule-day-header">
              <h3 className="schedule-day-title">{dateKey}</h3>
              <span className="schedule-day-count">{datePosts.length} post{datePosts.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="schedule-day-posts">
              {datePosts.map(renderPostCard)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Count posts by approval status
  const approvalCounts = {
    all: posts.length,
    pending: posts.filter(p => p.approvalStatus === 'pending').length,
    approved: posts.filter(p => p.approvalStatus === 'approved').length,
    rejected: posts.filter(p => p.approvalStatus === 'rejected').length,
  };

  return (
    <div className="schedule-container">
      {/* Subscription Banner */}
      {!canPost && (
        <SubscriptionGuard
          showBanner={true}
          showOverlay={false}
          message="Subscribe to view your scheduled posts and manage your content calendar"
        />
      )}

      <div className="schedule-header">
        <h1 className="page-title">Schedule</h1>
        <div className="schedule-controls">
          <div className="view-toggle">
            <button
              className={`view-btn ${view === "week" ? "active" : ""}`}
              onClick={() => setView("week")}
            >
              Week
            </button>
            <button
              className={`view-btn ${view === "month" ? "active" : ""}`}
              onClick={() => setView("month")}
            >
              Month
            </button>
            <button
              className={`view-btn ${view === "schedule" ? "active" : ""}`}
              onClick={() => setView("schedule")}
            >
              Schedule
            </button>
          </div>

          {view !== "schedule" && (
            <div className="date-navigation">
              <button onClick={() => view === "week" ? navigateWeek("prev") : navigateMonth("prev")}>
                ←
              </button>
              <span className="current-period">
                {view === "week"
                  ? `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                  : currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <button onClick={() => view === "week" ? navigateWeek("next") : navigateMonth("next")}>
                →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Approval Filter Tabs - Only show for tiers with approval workflows */}
      {hasApprovalWorkflows && (
        <div className="approval-filter-tabs">
          <button
            className={`filter-tab ${approvalFilter === 'all' ? 'active' : ''}`}
            onClick={() => setApprovalFilter('all')}
          >
            All <span className="filter-count">{approvalCounts.all}</span>
          </button>
          <button
            className={`filter-tab pending ${approvalFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setApprovalFilter('pending')}
          >
            <FaClock size={12} /> Pending <span className="filter-count">{approvalCounts.pending}</span>
          </button>
          <button
            className={`filter-tab approved ${approvalFilter === 'approved' ? 'active' : ''}`}
            onClick={() => setApprovalFilter('approved')}
          >
            <FaCheck size={12} /> Approved <span className="filter-count">{approvalCounts.approved}</span>
          </button>
          <button
            className={`filter-tab rejected ${approvalFilter === 'rejected' ? 'active' : ''}`}
            onClick={() => setApprovalFilter('rejected')}
          >
            <FaTimes size={12} /> Rejected <span className="filter-count">{approvalCounts.rejected}</span>
          </button>
        </div>
      )}

      <div className="schedule-content">
        {loading ? (
          <LoadingContainer message="Loading scheduled posts..." />
        ) : (
          <>
            {view === "week" && renderWeekView()}
            {view === "month" && renderMonthView()}
            {view === "schedule" && renderScheduleView()}
          </>
        )}
      </div>

      {/* Post Detail Panel */}
      {selectedPost && (
        <PostDetailPanel
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onRequestChanges={handleRequestChanges}
          onEditScheduledPost={handleEditScheduledPost}
          showApprovalActions={canApprove && hasApprovalWorkflows}
        />
      )}
    </div>
  );
};
