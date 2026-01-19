import React, { useState, useEffect } from "react";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAuth } from "../../contexts/AuthContext";
import { baseURL } from "../../utils/constants";
import { CalendarPostModal } from "../../components/client/CalendarPostModal";
import "./ClientCalendar.css";

export const ClientCalendar = () => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedPosts, setSelectedPosts] = useState([]);

  useEffect(() => {
    fetchPosts();
  }, [activeWorkspace, currentDate]);

  // Handle body scroll lock when modal is open
  useEffect(() => {
    if (selectedDate) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedDate]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && selectedDate) {
        setSelectedDate(null);
        setSelectedPosts([]);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [selectedDate]);

  const fetchPosts = async () => {
    if (!activeWorkspace || !user) return;

    try {
      setLoading(true);
      const res = await fetch(
        `${baseURL}/api/post/pending-approvals?workspaceId=${activeWorkspace.id}&userId=${user.id}&status=all`
      );

      if (res.ok) {
        const data = await res.json();
        const responseData = data.data || data;
        const allPosts = [
          ...(responseData.grouped?.pending || []),
          ...(responseData.grouped?.changes_requested || []),
          ...(responseData.grouped?.approved || []),
          ...(responseData.grouped?.rejected || [])
        ];
        setPosts(allPosts);
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first of the month
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

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
    if (approvalStatus === 'rejected') return '#ef4444';
    if (approvalStatus === 'approved') return '#10b981';
    if (status === 'pending_approval') return '#f59e0b';
    if (status === 'changes_requested') return '#f97316';
    return '#6b7280';
  };

  const handleDateClick = (date) => {
    if (!date) return;
    const datePosts = getPostsForDate(date);
    if (datePosts.length > 0) {
      setSelectedDate(date);
      setSelectedPosts(datePosts);
    }
  };

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

  const days = getDaysInMonth(currentDate);
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="client-calendar">
      <div className="calendar-header">
        <h1>Content Calendar</h1>
        <p>View all scheduled posts at a glance.</p>
      </div>

      <div className="calendar-container">
        {/* Calendar */}
        <div className="calendar-main">
          <div className="calendar-nav">
            <button className="nav-btn" onClick={prevMonth}>←</button>
            <h2>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
            <button className="nav-btn" onClick={nextMonth}>→</button>
          </div>

          <div className="calendar-grid">
            {/* Day headers */}
            {dayNames.map((day) => (
              <div key={day} className="calendar-day-header">{day}</div>
            ))}

            {/* Calendar days */}
            {days.map((date, index) => {
              const datePosts = date ? getPostsForDate(date) : [];
              const isToday = date &&
                date.toDateString() === new Date().toDateString();
              const isSelected = date && selectedDate &&
                date.toDateString() === selectedDate.toDateString();

              return (
                <div
                  key={index}
                  className={`calendar-day ${!date ? 'empty' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${datePosts.length > 0 ? 'has-posts' : ''}`}
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
                              style={{ backgroundColor: getStatusColor(post.status, post.approval_status) }}
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
              <div className="legend-dot" style={{ backgroundColor: '#f59e0b' }} />
              <span>Pending Approval</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ backgroundColor: '#10b981' }} />
              <span>Approved</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ backgroundColor: '#f97316' }} />
              <span>Changes Requested</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ backgroundColor: '#ef4444' }} />
              <span>Rejected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for Selected Date Posts */}
      {selectedDate && selectedPosts.length > 0 && (
        <CalendarPostModal
          posts={selectedPosts}
          selectedDate={selectedDate}
          currentPostIndex={0}
          onClose={() => {
            setSelectedDate(null);
            setSelectedPosts([]);
          }}
          onPostUpdated={fetchPosts}
        />
      )}
    </div>
  );
};
