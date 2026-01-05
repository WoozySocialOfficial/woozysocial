import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { SiX } from "react-icons/si";
import { formatTimeInTimezone, formatDateOnlyInTimezone } from "../utils/timezones";
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

export const ScheduleContent = () => {
  const { user, profile } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("week"); // week, month, kanban
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch scheduled and published posts
  const fetchPosts = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await fetch(`${baseURL}/api/post-history?workspaceId=${activeWorkspace.id}`);
      if (!response.ok) throw new Error("Failed to fetch posts");

      const data = await response.json();
      const allPosts = data.history || [];

      // Map posts with their schedule dates
      // Keep scheduleDate as ISO string to prevent timezone conversion issues
      const mappedPosts = allPosts.map(post => ({
        id: post.id,
        content: post.post || "",
        platforms: post.platforms || [],
        scheduleDate: post.scheduleDate,  // Keep as string
        status: post.status,
        type: post.type,
        mediaUrls: post.mediaUrls || [],
      }));

      setPosts(mappedPosts);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

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
    return posts.filter(post => {
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
    return posts.filter(post => {
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

    posts.forEach(post => {
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

  const weekDates = getWeekDates();
  const monthDates = getMonthDates();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const timeSlots = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM

  // Render Post Card
  const renderPostCard = (post) => {
    const Icon = PLATFORM_ICONS[post.platforms[0]?.toLowerCase()];

    return (
      <div
        key={post.id}
        className={`post-card ${post.status === "success" ? "published" : "scheduled"}`}
        title={post.content}
      >
        <div className="post-card-content">
          {post.content.substring(0, 50)}{post.content.length > 50 && "..."}
        </div>
        <div className="post-card-meta">
          {Icon && <Icon size={14} />}
          <span className="post-time">
            {formatTimeInTimezone(post.scheduleDate, profile?.timezone || 'UTC')}
          </span>
        </div>
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
          <div key={dateKey} className="schedule-day-section">
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

  return (
    <div className="schedule-container">
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
    </div>
  );
};
