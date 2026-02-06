import React, { useState, useEffect, useMemo, useRef } from "react";
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Button } from "@chakra-ui/react";
import { formatDateInTimezone } from "../../utils/timezones";
import "./ScheduleModal.css";
import "./ScheduleModalCompact.css";

// Industry-average best posting times per day of week (fallback when no data)
const INDUSTRY_DEFAULTS = {
  Sunday:    { time: '11:00 AM', score: 70 },
  Monday:    { time: '10:00 AM', score: 75 },
  Tuesday:   { time: '9:00 AM',  score: 90 },
  Wednesday: { time: '11:00 AM', score: 85 },
  Thursday:  { time: '10:00 AM', score: 80 },
  Friday:    { time: '2:00 PM',  score: 78 },
  Saturday:  { time: '11:00 AM', score: 72 },
};

export const ScheduleModal = ({
  isOpen,
  onClose,
  onConfirm,
  timezone = 'UTC',
  bestTimes = [],
  hasRealData = false,
  initialDate = null
}) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [bestTimePopup, setBestTimePopup] = useState(null); // { dayName, time, score, source }
  const calendarRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (initialDate) {
        // Load the existing scheduled date into the modal
        const date = new Date(initialDate);
        setSelectedDate(date);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = (Math.round(date.getMinutes() / 15) * 15 % 60).toString().padStart(2, '0');
        setSelectedTime(`${hours}:${minutes}`);
        setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      } else if (!selectedDate) {
        // Default to tomorrow at 9 AM for new posts
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        setSelectedDate(tomorrow);
        setSelectedTime('09:00');
      }
    }
  }, [isOpen, initialDate]);

  // Build lookup: day name → best time recommendation (API data takes priority over defaults)
  const bestTimeByDay = useMemo(() => {
    const lookup = { ...INDUSTRY_DEFAULTS };
    // Override with real/API data
    bestTimes.forEach(bt => {
      if (bt.day && bt.time) {
        lookup[bt.day] = { time: bt.time, score: bt.score, avgEngagement: bt.avgEngagement };
      }
    });
    return lookup;
  }, [bestTimes]);

  const handleDateClick = (date) => {
    const newDate = new Date(selectedDate || new Date());
    newDate.setFullYear(date.getFullYear());
    newDate.setMonth(date.getMonth());
    newDate.setDate(date.getDate());
    setSelectedDate(newDate);

    // Show best-time recommendation popup for this day of the week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[date.getDay()];
    const recommendation = bestTimeByDay[dayName];

    if (recommendation) {
      const isFromApi = bestTimes.some(bt => bt.day === dayName);
      setBestTimePopup({
        dayName,
        time: recommendation.time,
        score: recommendation.score,
        source: isFromApi && hasRealData ? 'your data' : 'industry average'
      });
    }
  };

  // Apply the recommended time from the popup
  const applyRecommendedTime = () => {
    if (!bestTimePopup) return;

    const timeStr = bestTimePopup.time;
    const timeHour = parseInt(timeStr.split(':')[0]);
    const isPM = timeStr.includes('PM');
    const is12Hour = timeHour === 12;
    let hour24 = isPM ? (is12Hour ? 12 : timeHour + 12) : (is12Hour ? 0 : timeHour);

    const time24 = `${hour24.toString().padStart(2, '0')}:00`;
    setSelectedTime(time24);

    // Also update the selected date's time
    if (selectedDate) {
      const newDate = new Date(selectedDate);
      newDate.setHours(hour24, 0, 0, 0);
      setSelectedDate(newDate);
    }

    setBestTimePopup(null);
  };

  const handleTimeChange = (e) => {
    const time = e.target.value;
    setSelectedTime(time);

    const [hours, minutes] = time.split(':');
    const newDate = new Date(selectedDate || new Date());
    newDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    setSelectedDate(newDate);
  };

  const handleQuickSelectBestTime = (bestTime) => {
    const timeHour = parseInt(bestTime.time.split(':')[0]);
    const isPM = bestTime.time.includes('PM');
    const is12Hour = timeHour === 12;
    let hour24 = isPM ? (is12Hour ? 12 : timeHour + 12) : (is12Hour ? 0 : timeHour);

    // Find next occurrence of this day
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayIndex = dayNames.indexOf(bestTime.day);
    const today = new Date();
    const currentDayIndex = today.getDay();

    let daysUntilTarget = targetDayIndex - currentDayIndex;
    if (daysUntilTarget <= 0) daysUntilTarget += 7;

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilTarget);
    targetDate.setHours(hour24, 0, 0, 0);

    setSelectedDate(targetDate);
    setSelectedTime(`${hour24.toString().padStart(2, '0')}:00`);
  };

  const handleConfirm = () => {
    if (selectedDate) {
      onConfirm(selectedDate);
    }
  };

  const handleCancel = () => {
    // Only reset internal state if there's no initialDate (new post flow)
    if (!initialDate) {
      setSelectedDate(null);
      setSelectedTime('09:00');
    }
    setBestTimePopup(null);
    onClose();
  };

  // Generate calendar days
  const generateCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Previous month's trailing days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }

    // Next month's leading days
    const remainingDays = 42 - days.length; // 6 rows * 7 days
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }

    return days;
  };

  const navigateMonth = (direction) => {
    const newMonth = new Date(calendarMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    setCalendarMonth(newMonth);
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date) => {
    return selectedDate && date.toDateString() === selectedDate.toDateString();
  };

  const isPast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const calendar = generateCalendar();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Generate 15-minute time slots
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const hour12 = hour % 12 || 12;
        const ampm = hour < 12 ? 'AM' : 'PM';
        const time12 = `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
        slots.push({ time24, time12, hour, minute });
      }
    }
    return slots;
  };

  // Get engagement score for a given time
  const getEngagementForTime = (hour, minute) => {
    if (!bestTimes || bestTimes.length === 0) return null;

    const selectedDay = selectedDate ? selectedDate.toLocaleDateString('en-US', { weekday: 'long' }) : null;

    // Find best times matching this hour (within same hour slot)
    const matchingTimes = bestTimes.filter(bt => {
      const timeHour = parseInt(bt.time.split(':')[0]);
      const isPM = bt.time.includes('PM');
      const is12Hour = timeHour === 12;
      let hour24 = isPM ? (is12Hour ? 12 : timeHour + 12) : (is12Hour ? 0 : timeHour);

      return hour24 === hour && (!selectedDay || bt.day === selectedDay);
    });

    return matchingTimes.length > 0 ? matchingTimes[0] : null;
  };

  const timeSlots = generateTimeSlots();
  const currentTimeSlot = timeSlots.find(slot => slot.time24 === selectedTime);
  const currentEngagement = currentTimeSlot ? getEngagementForTime(currentTimeSlot.hour, currentTimeSlot.minute) : null;

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} size="lg" isCentered>
      <ModalOverlay bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(4px)" />
      <ModalContent className="schedule-modal-geist">
        <ModalHeader className="schedule-modal-header">
          Schedule Post
          <div className="schedule-modal-subtitle">
            Choose when your post goes live
          </div>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody className="schedule-modal-body">
          <div className="schedule-grid-compact">
            {/* Left: Calendar & Time */}
            <div className="calendar-section-compact">
              {/* Month navigation */}
              <div className="calendar-header">
                <button
                  className="calendar-nav-btn"
                  onClick={() => navigateMonth(-1)}
                  aria-label="Previous month"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="calendar-month">
                  {monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                </div>
                <button
                  className="calendar-nav-btn"
                  onClick={() => navigateMonth(1)}
                  aria-label="Next month"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {/* Day names */}
              <div className="calendar-weekdays">
                {dayNames.map(day => (
                  <div key={day} className="calendar-weekday">{day}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="calendar-days" ref={calendarRef}>
                {calendar.map((day, idx) => (
                  <button
                    key={idx}
                    className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday(day.date) ? 'today' : ''} ${isSelected(day.date) ? 'selected' : ''} ${isPast(day.date) ? 'past' : ''}`}
                    onClick={() => !isPast(day.date) && handleDateClick(day.date)}
                    disabled={isPast(day.date)}
                  >
                    {day.date.getDate()}
                  </button>
                ))}
              </div>

              {/* Best time recommendation popup */}
              {bestTimePopup && (
                <div className="best-time-popup">
                  <div className="best-time-popup-content">
                    <div className="best-time-popup-header">
                      <span className="best-time-popup-icon">&#9201;</span>
                      <span className="best-time-popup-title">Best time for {bestTimePopup.dayName}s</span>
                      <button
                        className="best-time-popup-close"
                        onClick={() => setBestTimePopup(null)}
                        aria-label="Dismiss"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="best-time-popup-body">
                      <div className="best-time-popup-time">{bestTimePopup.time}</div>
                      <div className="best-time-popup-meta">
                        <span className="best-time-popup-score">{bestTimePopup.score}% optimal</span>
                        <span className="best-time-popup-source">Based on {bestTimePopup.source}</span>
                      </div>
                    </div>
                    <button className="best-time-popup-apply" onClick={applyRecommendedTime}>
                      Use {bestTimePopup.time}
                    </button>
                  </div>
                </div>
              )}

              {/* Time selector with 15-min increments */}
              <div className="time-selector-compact">
                <label className="time-label">Time</label>
                <select
                  value={selectedTime}
                  onChange={handleTimeChange}
                  className="time-select"
                >
                  {timeSlots.map(slot => (
                    <option key={slot.time24} value={slot.time24}>
                      {slot.time12}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right: Best Time Highlight */}
            <div className="best-time-highlight">
              <div className="highlight-header">
                <div className="highlight-title">Suggested</div>
                <div className="highlight-source">
                  {hasRealData ? 'Your data' : 'Industry'}
                </div>
              </div>

              {currentEngagement ? (
                <div className="engagement-display">
                  <div className="engagement-time">{currentEngagement.time}</div>
                  <div className="engagement-label">Best time to post</div>
                  {currentEngagement.avgEngagement && (
                    <div className="engagement-value">
                      ~{currentEngagement.avgEngagement} engagements
                    </div>
                  )}
                  <div className="engagement-score">
                    <div className="score-bar-bg">
                      <div className="score-bar-fill" style={{ width: `${currentEngagement.score}%` }}></div>
                    </div>
                    <div className="score-text">{currentEngagement.score}% optimal</div>
                  </div>
                </div>
              ) : (
                <div className="no-engagement">
                  <div className="selected-time-display">{currentTimeSlot?.time12 || '9:00 AM'}</div>
                  <div className="no-engagement-text">No data for this time</div>
                </div>
              )}

              {bestTimes.length > 0 && (
                <div className="quick-picks">
                  <div className="quick-picks-label">Quick picks:</div>
                  {bestTimes.slice(0, 3).map((time, idx) => (
                    <button
                      key={idx}
                      className="quick-pick-btn"
                      onClick={() => handleQuickSelectBestTime(time)}
                    >
                      {time.day} {time.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ModalBody>

        <ModalFooter className="schedule-modal-footer">
          <Button variant="ghost" onClick={handleCancel} className="btn-ghost">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            isDisabled={!selectedDate}
            className="btn-primary"
          >
            Confirm Schedule
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
