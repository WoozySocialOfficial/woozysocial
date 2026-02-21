import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAuth } from "../../contexts/AuthContext";
import { useClientCalendarPosts, useInvalidateQueries } from "../../hooks/useQueries";
import { CalendarPostModal } from "../../components/client/CalendarPostModal";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube } from "react-icons/fa";
import { FaTiktok, FaThreads } from "react-icons/fa6";
import { SiX, SiBluesky } from "react-icons/si";
import { formatTimeInTimezone } from "../../utils/timezones";
import "./ClientCalendar.css";

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  twitter: SiX,
  "x/twitter": SiX,
  bluesky: SiBluesky,
  threads: FaThreads,
};

export const ClientCalendar = () => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const location = useLocation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("month"); // "week" | "month"
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedPosts, setSelectedPosts] = useState([]);
  const [deepLinkPostIndex, setDeepLinkPostIndex] = useState(null);
  const { invalidatePosts } = useInvalidateQueries();

  // Use React Query for cached data fetching
  const { data: posts = [], isLoading: loading, refetch } = useClientCalendarPosts(
    activeWorkspace?.id,
    user?.id
  );

  // Handle body scroll lock when modal is open
  useEffect(() => {
    if (selectedDate) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [selectedDate]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && selectedDate) {
        setSelectedDate(null);
        setSelectedPosts([]);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedDate]);

  const handlePostUpdated = () => {
    invalidatePosts(activeWorkspace?.id);
    refetch();
  };

  // Handle deep-link from dashboard activity click
  useEffect(() => {
    const navState = location.state;
    if (!navState?.postId || loading || posts.length === 0) return;

    const targetPost = posts.find((p) => p.id === navState.postId);
    if (!targetPost) return;

    const postDateStr = targetPost.schedule_date || targetPost.scheduled_at;
    if (!postDateStr) return;

    const postDate = new Date(postDateStr);

    if (
      postDate.getMonth() !== currentDate.getMonth() ||
      postDate.getFullYear() !== currentDate.getFullYear()
    ) {
      setCurrentDate(new Date(postDate.getFullYear(), postDate.getMonth(), 1));
    }

    const dayDate = new Date(postDate.getFullYear(), postDate.getMonth(), postDate.getDate());
    const postsOnDate = posts.filter((p) => {
      if (!p.schedule_date) return false;
      const pDate = new Date(p.schedule_date);
      return (
        pDate.getDate() === dayDate.getDate() &&
        pDate.getMonth() === dayDate.getMonth() &&
        pDate.getFullYear() === dayDate.getFullYear()
      );
    });

    if (postsOnDate.length > 0) {
      const targetIndex = postsOnDate.findIndex((p) => p.id === navState.postId);
      setSelectedDate(dayDate);
      setSelectedPosts(postsOnDate);
      setDeepLinkPostIndex(targetIndex >= 0 ? targetIndex : 0);
    }

    window.history.replaceState({}, document.title);
  }, [location.state, posts, loading]);

  // ─── Month view helpers ───────────────────────────────────────────
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startingDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const getPostsForDate = (date) => {
    if (!date) return [];
    return posts.filter((post) => {
      if (!post.schedule_date) return false;
      const postDate = new Date(post.schedule_date);
      return (
        postDate.getDate() === date.getDate() &&
        postDate.getMonth() === date.getMonth() &&
        postDate.getFullYear() === date.getFullYear()
      );
    });
  };

  const getStatusColor = (status, approvalStatus) => {
    if (approvalStatus === "rejected") return "#ef4444";
    if (approvalStatus === "approved") return "#10b981";
    if (approvalStatus === "pending_internal") return "#ff9800";
    if (approvalStatus === "pending_client") return "#9c27b0";
    if (approvalStatus === "pending") return "#f59e0b";
    if (approvalStatus === "changes_requested") return "#f97316";
    if (status === "pending_approval") return "#f59e0b";
    return "#6b7280";
  };

  const getStatusLabel = (approvalStatus) => {
    const labels = {
      approved: "Approved",
      rejected: "Rejected",
      pending_internal: "Pending Review",
      pending_client: "Awaiting Client",
      pending: "Pending",
      changes_requested: "Changes Requested",
    };
    return labels[approvalStatus] || "Scheduled";
  };

  const handleDateClick = (date) => {
    if (!date) return;
    const datePosts = getPostsForDate(date);
    if (datePosts.length > 0) {
      setSelectedDate(date);
      setSelectedPosts(datePosts);
      setDeepLinkPostIndex(null);
    }
  };

  // ─── Week view helpers ────────────────────────────────────────────
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

  const getPostsForSlot = (date, hour) => {
    return posts.filter((post) => {
      if (!post.schedule_date) return false;
      const postDate = new Date(post.schedule_date);
      return (
        postDate.getFullYear() === date.getFullYear() &&
        postDate.getMonth() === date.getMonth() &&
        postDate.getDate() === date.getDate() &&
        postDate.getHours() === hour
      );
    });
  };

  const openModalForPost = (post, allDayPosts) => {
    const postDate = new Date(post.schedule_date);
    const dayDate = new Date(postDate.getFullYear(), postDate.getMonth(), postDate.getDate());
    const idx = allDayPosts.findIndex((p) => p.id === post.id);
    setSelectedDate(dayDate);
    setSelectedPosts(allDayPosts);
    setDeepLinkPostIndex(idx >= 0 ? idx : 0);
  };

  // ─── Navigation ───────────────────────────────────────────────────
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDate(null);
    setSelectedPosts([]);
  };
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDate(null);
    setSelectedPosts([]);
  };
  const navigateWeek = (dir) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + (dir === "next" ? 7 : -7));
    setCurrentDate(newDate);
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const timeSlots = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM – 11 PM

  const days = getDaysInMonth(currentDate);
  const weekDates = getWeekDates();

  // ─── Week view render ─────────────────────────────────────────────
  const renderWeekPostCard = (post, allDayPosts) => {
    const color = getStatusColor(post.status, post.approval_status);
    const label = getStatusLabel(post.approval_status);
    const text = post.post || post.caption || "";
    const time = post.schedule_date
      ? formatTimeInTimezone(post.schedule_date, activeWorkspace?.timezone || "UTC")
      : "";

    return (
      <div
        key={post.id}
        className="cc-week-post-card"
        style={{ borderLeftColor: color }}
        onClick={() => openModalForPost(post, allDayPosts)}
        title={text.substring(0, 80)}
      >
        <div className="cc-week-card-badge" style={{ backgroundColor: color }}>
          {label}
        </div>
        <div className="cc-week-card-text">
          {text.substring(0, 65)}{text.length > 65 ? "…" : ""}
        </div>
        <div className="cc-week-card-footer">
          <div className="cc-week-card-platforms">
            {(post.platforms || []).slice(0, 3).map((p, i) => {
              const Icon = PLATFORM_ICONS[p?.toLowerCase()];
              return Icon ? <Icon key={i} size={11} /> : null;
            })}
          </div>
          <span className="cc-week-card-time">{time}</span>
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    // Dynamic row heights
    const hourPostCounts = {};
    timeSlots.forEach((hour) => {
      let max = 0;
      weekDates.forEach((date) => {
        const count = getPostsForSlot(date, hour).length;
        if (count > max) max = count;
      });
      hourPostCounts[hour] = max;
    });

    const getSlotHeight = (hour) => {
      const count = hourPostCounts[hour];
      if (count === 0) return 72;
      const visible = Math.min(count, 2);
      const hasOverflow = count > 2;
      return Math.max(72, 28 + visible * 88 + (hasOverflow ? 28 : 0));
    };

    return (
      <div className="cc-week-view">
        {/* Sticky header row */}
        <div className="cc-week-time-header" />
        {weekDates.map((date, i) => {
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <div key={`hdr-${i}`} className={`cc-week-day-header${isToday ? " today" : ""}`}>
              <div className="cc-week-day-name">{dayNames[date.getDay()]}</div>
              <div className={`cc-week-day-date${isToday ? " today" : ""}`}>
                {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
          );
        })}

        {/* Time slots */}
        {timeSlots.map((hour) => {
          const h = getSlotHeight(hour);
          return (
            <React.Fragment key={hour}>
              <div className="cc-week-time-slot" style={{ height: `${h}px` }}>
                {hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}
              </div>
              {weekDates.map((date, dayIdx) => {
                const slotPosts = getPostsForSlot(date, hour);
                const allDayPosts = getPostsForDate(date);
                const visible = slotPosts.slice(0, 2);
                const remaining = slotPosts.length - 2;

                return (
                  <div key={dayIdx} className="cc-week-cell" style={{ height: `${h}px` }}>
                    {visible.map((post) => renderWeekPostCard(post, allDayPosts))}
                    {remaining > 0 && (
                      <div
                        className="cc-week-more"
                        onClick={() => openModalForPost(slotPosts[2], allDayPosts)}
                      >
                        +{remaining} more
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

  return (
    <div className="client-calendar">
      <div className="calendar-header">
        <h1>Content Calendar</h1>
        <p>View all scheduled posts at a glance.</p>
      </div>

      <div className="calendar-container">
        <div className="calendar-main">
          {/* View toggle + navigation */}
          <div className="cc-controls">
            <div className="cc-view-toggle">
              <button
                className={`cc-view-btn${view === "week" ? " active" : ""}`}
                onClick={() => setView("week")}
              >
                Week
              </button>
              <button
                className={`cc-view-btn${view === "month" ? " active" : ""}`}
                onClick={() => setView("month")}
              >
                Month
              </button>
            </div>

            <div className="cc-nav">
              <button
                className="nav-btn"
                onClick={() => (view === "week" ? navigateWeek("prev") : prevMonth())}
              >
                ←
              </button>
              <h2>
                {view === "week"
                  ? `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                  : `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
              </h2>
              <button
                className="nav-btn"
                onClick={() => (view === "week" ? navigateWeek("next") : nextMonth())}
              >
                →
              </button>
            </div>
          </div>

          {/* Week view */}
          {view === "week" ? (
            <>
              {loading ? (
                <div className="cc-loading">Loading posts…</div>
              ) : (
                renderWeekView()
              )}
            </>
          ) : (
            <>
              {/* Month grid */}
              <div className="calendar-grid">
                {dayNames.map((day) => (
                  <div key={day} className="calendar-day-header">{day}</div>
                ))}
                {days.map((date, index) => {
                  const datePosts = date ? getPostsForDate(date) : [];
                  const isToday = date && date.toDateString() === new Date().toDateString();
                  const isSelected =
                    date && selectedDate && date.toDateString() === selectedDate.toDateString();

                  return (
                    <div
                      key={index}
                      className={`calendar-day ${!date ? "empty" : ""} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${datePosts.length > 0 ? "has-posts" : ""}`}
                      onClick={() => handleDateClick(date)}
                    >
                      {date && (
                        <>
                          <span className="day-number">{date.getDate()}</span>
                          {datePosts.length > 0 && (
                            <div className="day-posts">
                              {datePosts.slice(0, 3).map((post, i) => (
                                <div
                                  key={post.id}
                                  className="post-dot"
                                  style={{
                                    backgroundColor: getStatusColor(
                                      post.status,
                                      post.approval_status
                                    ),
                                  }}
                                  title={post.post?.substring(0, 50)}
                                />
                              ))}
                              {datePosts.length > 3 && (
                                <span className="more-posts">+{datePosts.length - 3}</span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="calendar-legend">
                <div className="legend-item">
                  <div className="legend-dot" style={{ backgroundColor: "#ff9800" }} />
                  <span>Pending Final Approver</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot" style={{ backgroundColor: "#9c27b0" }} />
                  <span>Awaiting Client</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot" style={{ backgroundColor: "#10b981" }} />
                  <span>Approved</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot" style={{ backgroundColor: "#f97316" }} />
                  <span>Changes Requested</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot" style={{ backgroundColor: "#ef4444" }} />
                  <span>Rejected</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal */}
      {selectedDate && selectedPosts.length > 0 && (
        <CalendarPostModal
          posts={selectedPosts}
          selectedDate={selectedDate}
          currentPostIndex={deepLinkPostIndex !== null ? deepLinkPostIndex : 0}
          onClose={() => {
            setSelectedDate(null);
            setSelectedPosts([]);
            setDeepLinkPostIndex(null);
          }}
          onPostUpdated={handlePostUpdated}
        />
      )}
    </div>
  );
};
