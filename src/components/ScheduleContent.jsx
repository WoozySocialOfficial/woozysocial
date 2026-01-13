import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaCheck, FaTimes, FaComment, FaClock } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { SiX } from "react-icons/si";
import { formatTimeInTimezone, formatDateOnlyInTimezone } from "../utils/timezones";
import { SubscriptionGuard } from "./subscription/SubscriptionGuard";
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
  const { user, profile, hasActiveProfile, subscriptionStatus, isWhitelisted } = useAuth();
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
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState("all"); // all, pending, approved, rejected
  const [selectedPost, setSelectedPost] = useState(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [comment, setComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Check if user is a client (can approve/reject)
  const isClient = workspaceMembership?.role === 'client';
  const canApprove = isClient || workspaceMembership?.role === 'owner' || workspaceMembership?.role === 'admin';

  // Fetch scheduled and published posts from both Ayrshare AND local database
  const fetchPosts = useCallback(async () => {
    if (!user || !activeWorkspace?.id) return;

    setLoading(true);
    try {
      // Fetch from both sources in parallel
      const [historyResponse, pendingResponse] = await Promise.all([
        fetch(`${baseURL}/api/post-history?workspaceId=${activeWorkspace.id}`),
        fetch(`${baseURL}/api/post/pending-approvals?workspaceId=${activeWorkspace.id}&userId=${user.id}&status=all`)
      ]);

      let allPosts = [];

      // Process Ayrshare history
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        const responseData = historyData.data || historyData;
        const ayrshareHistory = responseData.history || [];

        // Map Ayrshare posts
        const ayrPosts = ayrshareHistory.map(post => ({
          id: post.id,
          content: post.post || "",
          platforms: post.platforms || [],
          scheduleDate: post.scheduleDate,
          status: post.status,
          type: post.type,
          mediaUrls: post.mediaUrls || [],
          approvalStatus: 'approved', // Ayrshare posts are already approved/posted
          requiresApproval: false,
          comments: post.comments || [],
          source: 'ayrshare'
        }));
        allPosts = [...ayrPosts];
      }

      // Process pending approvals from local database
      if (pendingResponse.ok) {
        const pendingData = await pendingResponse.json();
        const responseData = pendingData.data || pendingData;
        const pendingPosts = responseData.posts || [];

        // Map local posts awaiting approval
        const localPosts = pendingPosts
          .filter(post => {
            // Only include posts that DON'T have an ayr_post_id
            // (posts with ayr_post_id are already in Ayrshare history)
            return !post.ayr_post_id;
          })
          .map(post => ({
            id: post.id,
            content: post.post || post.caption || "",
            platforms: post.platforms || [],
            scheduleDate: post.schedule_date || post.scheduled_at,
            status: post.status,
            type: 'scheduled',
            mediaUrls: post.media_urls || (post.media_url ? [post.media_url] : []),
            approvalStatus: post.approval_status || 'pending',
            requiresApproval: post.requires_approval !== false,
            comments: [],
            commentCount: post.commentCount || 0,
            source: 'local',
            user_profiles: post.user_profiles
          }));

        // Add local posts (already filtered to exclude duplicates with ayr_post_id)
        allPosts = [...allPosts, ...localPosts];
      }

      setPosts(allPosts);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  }, [user, activeWorkspace?.id]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

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

      // Refresh posts
      await fetchPosts();
      setShowCommentModal(false);
      setSelectedPost(null);
      setComment("");
    } catch (error) {
      console.error('Error updating approval:', error);
      alert(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle adding a comment
  const handleAddComment = async (postId) => {
    if (!comment.trim() || !activeWorkspace) return;

    setActionLoading(true);
    try {
      const response = await fetch(`${baseURL}/api/post/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          workspaceId: activeWorkspace.id,
          userId: user.id,
          comment: comment.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add comment');
      }

      await fetchPosts();
      setComment("");
    } catch (error) {
      console.error('Error adding comment:', error);
      alert(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Filter posts by approval status
  const filteredPosts = posts.filter(post => {
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
      return (
        postDate.getFullYear() === date.getFullYear() &&
        postDate.getMonth() === date.getMonth() &&
        postDate.getDate() === date.getDate() &&
        postDate.getHours() === hour
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
        const dateKey = formatDateOnlyInTimezone(post.scheduleDate, profile?.timezone || 'UTC');

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
      const today = formatDateOnlyInTimezone(new Date(), profile?.timezone || 'UTC');
      const todaySection = document.querySelector(`[data-date="${today}"]`);

      if (todaySection) {
        // Scroll to today's section with some offset
        setTimeout(() => {
          todaySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }, [view, loading, profile?.timezone]);

  const weekDates = getWeekDates();
  const monthDates = getMonthDates();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const timeSlots = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM

  // Render Post Card
  const renderPostCard = (post, expanded = false) => {
    const approvalInfo = APPROVAL_STATUS[post.approvalStatus] || APPROVAL_STATUS.pending;
    const ApprovalIcon = approvalInfo.icon;

    return (
      <div
        key={post.id}
        className={`post-card ${post.status === "success" ? "published" : "scheduled"} approval-${post.approvalStatus}`}
        title="Click to view details"
        onClick={() => { setSelectedPost(post); setShowCommentModal(true); }}
      >
        <div className="post-card-header">
          <div className="post-approval-badge" style={{ backgroundColor: approvalInfo.color }}>
            <ApprovalIcon size={10} />
            <span>{approvalInfo.label}</span>
          </div>
          {(post.comments?.length > 0 || post.commentCount > 0) && (
            <div className="post-comment-count" title={`${post.comments?.length || post.commentCount} comment(s)`}>
              <FaComment size={10} />
              <span>{post.comments?.length || post.commentCount}</span>
            </div>
          )}
        </div>
        <div className="post-card-content">
          {post.content.substring(0, expanded ? 150 : 80)}{post.content.length > (expanded ? 150 : 80) && "..."}
        </div>
        {post.mediaUrls?.length > 0 && (
          <div className="post-card-media">
            <img src={post.mediaUrls[0]} alt="Post media" />
          </div>
        )}
        <div className="post-card-meta">
          <div className="post-platforms">
            {post.platforms.map((platform, idx) => {
              const PlatformIcon = PLATFORM_ICONS[platform?.toLowerCase()];
              return PlatformIcon ? <PlatformIcon key={idx} size={12} /> : null;
            })}
          </div>
          <span className="post-time">
            {formatTimeInTimezone(post.scheduleDate, profile?.timezone || 'UTC')}
          </span>
        </div>

        {/* Approval Actions - only show for scheduled posts */}
        {post.status !== "success" && canApprove && (
          <div className="post-approval-actions">
            {post.approvalStatus !== 'approved' && (
              <button
                className="approval-btn approve"
                onClick={(e) => { e.stopPropagation(); handleApproval(post.id, 'approve'); }}
                disabled={actionLoading}
                title="Approve"
              >
                <FaCheck size={12} />
              </button>
            )}
            {post.approvalStatus !== 'rejected' && (
              <button
                className="approval-btn reject"
                onClick={(e) => { e.stopPropagation(); handleApproval(post.id, 'reject'); }}
                disabled={actionLoading}
                title="Reject"
              >
                <FaTimes size={12} />
              </button>
            )}
            <button
              className="approval-btn comment"
              onClick={(e) => { e.stopPropagation(); setSelectedPost(post); setShowCommentModal(true); }}
              disabled={actionLoading}
              title="Comment"
            >
              <FaComment size={12} />
            </button>
          </div>
        )}
      </div>
    );
  };

  // Week View
  const renderWeekView = () => (
    <div className="week-view">
      <div className="time-column">
        <div className="time-header"></div>
        {timeSlots.map((hour) => (
          <div key={hour} className="time-slot">
            {hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}
          </div>
        ))}
      </div>

      {weekDates.map((date, dayIndex) => (
        <div key={dayIndex} className="day-column">
          <div className="day-header">
            <div className="day-name">{dayNames[date.getDay()]}</div>
            <div className="day-date">
              {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </div>
          {timeSlots.map((hour) => {
            const slotPosts = getPostsForSlot(date, hour);
            return (
              <div key={hour} className="schedule-cell">
                {slotPosts.map(renderPostCard)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

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

      {/* Approval Filter Tabs */}
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

      <div className="schedule-content">
        {loading ? (
          <div className="schedule-loading">Loading posts...</div>
        ) : (
          <>
            {view === "week" && renderWeekView()}
            {view === "month" && renderMonthView()}
            {view === "schedule" && renderScheduleView()}
          </>
        )}
      </div>

      {/* Comment Modal */}
      {showCommentModal && selectedPost && (
        <div className="comment-modal-overlay" onClick={() => setShowCommentModal(false)}>
          <div className="comment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="comment-modal-header">
              <h3>Review Post</h3>
              <button className="close-modal" onClick={() => setShowCommentModal(false)}>×</button>
            </div>

            <div className="comment-modal-post">
              <div className="modal-post-content">{selectedPost.content}</div>
              {selectedPost.mediaUrls?.length > 0 && (
                <div className="modal-post-media">
                  {selectedPost.mediaUrls.map((url, idx) => (
                    <img key={idx} src={url} alt={`Media ${idx + 1}`} />
                  ))}
                </div>
              )}
              <div className="modal-post-meta">
                <span className="modal-platforms">
                  {selectedPost.platforms.map((p, idx) => {
                    const PlatformIcon = PLATFORM_ICONS[p?.toLowerCase()];
                    return PlatformIcon ? <PlatformIcon key={idx} size={14} /> : null;
                  })}
                </span>
                <span className="modal-time">
                  Scheduled: {formatTimeInTimezone(selectedPost.scheduleDate, profile?.timezone || 'UTC')} on {formatDateOnlyInTimezone(selectedPost.scheduleDate, profile?.timezone || 'UTC')}
                </span>
              </div>
            </div>

            {/* Existing comments */}
            {selectedPost.comments?.length > 0 && (
              <div className="existing-comments">
                <h4>Comments</h4>
                {selectedPost.comments.map((c, idx) => (
                  <div key={idx} className={`comment-item ${c.is_system ? 'system' : ''}`}>
                    <div className="comment-author">{c.user_name || 'User'}</div>
                    <div className="comment-text">{c.comment}</div>
                    <div className="comment-time">{new Date(c.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="comment-input-section">
              <textarea
                placeholder="Add a comment or feedback..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>

            <div className="comment-modal-actions">
              <button
                className="modal-btn approve"
                onClick={() => handleApproval(selectedPost.id, 'approve', comment)}
                disabled={actionLoading}
              >
                <FaCheck /> Approve
              </button>
              <button
                className="modal-btn reject"
                onClick={() => handleApproval(selectedPost.id, 'reject', comment)}
                disabled={actionLoading}
              >
                <FaTimes /> Reject
              </button>
              {comment.trim() && (
                <button
                  className="modal-btn comment-only"
                  onClick={() => handleAddComment(selectedPost.id)}
                  disabled={actionLoading}
                >
                  Comment Only
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
