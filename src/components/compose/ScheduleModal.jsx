import React, { useState, useEffect, useMemo, useRef } from "react";
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Button } from "@chakra-ui/react";
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

const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const [bestTimePopup, setBestTimePopup] = useState(null);
  const [popupSource, setPopupSource] = useState('industry'); // 'industry' or 'yours'

  useEffect(() => {
    if (isOpen) {
      if (initialDate) {
        const date = new Date(initialDate);
        setSelectedDate(date);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = (Math.round(date.getMinutes() / 15) * 15 % 60).toString().padStart(2, '0');
        setSelectedTime(`${hours}:${minutes}`);
        setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      } else if (!selectedDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        setSelectedDate(tomorrow);
        setSelectedTime('09:00');
      }
    }
  }, [isOpen, initialDate]);

  // Build lookup: day name → best time from API data
  const apiTimeByDay = useMemo(() => {
    const lookup = {};
    bestTimes.forEach(bt => {
      if (bt.day && bt.time && !lookup[bt.day]) {
        lookup[bt.day] = { time: bt.time, score: bt.score, avgEngagement: bt.avgEngagement };
      }
    });
    return lookup;
  }, [bestTimes]);

  // Get recommendation for a day, respecting the toggle
  const getRecommendation = (dayName, source) => {
    if (source === 'yours' && apiTimeByDay[dayName]) {
      return { ...apiTimeByDay[dayName], label: 'your data' };
    }
    return { ...INDUSTRY_DEFAULTS[dayName], label: 'industry average' };
  };

  const handleDateClick = (date) => {
    const newDate = new Date(selectedDate || new Date());
    newDate.setFullYear(date.getFullYear());
    newDate.setMonth(date.getMonth());
    newDate.setDate(date.getDate());
    setSelectedDate(newDate);

    const dayName = DAY_NAMES_FULL[date.getDay()];
    const hasApiData = !!apiTimeByDay[dayName];
    const source = hasApiData && hasRealData ? popupSource : 'industry';
    const rec = getRecommendation(dayName, source);

    setBestTimePopup({
      dayName,
      time: rec.time,
      score: rec.score,
      label: rec.label,
      hasToggle: hasApiData && hasRealData
    });
  };

  // Toggle between industry and user data in popup
  const togglePopupSource = () => {
    const newSource = popupSource === 'industry' ? 'yours' : 'industry';
    setPopupSource(newSource);

    if (bestTimePopup) {
      const rec = getRecommendation(bestTimePopup.dayName, newSource);
      setBestTimePopup(prev => ({
        ...prev,
        time: rec.time,
        score: rec.score,
        label: rec.label
      }));
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

  const handleConfirm = () => {
    if (selectedDate) {
      onConfirm(selectedDate);
    }
  };

  const handleCancel = () => {
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

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthLastDay - i), isCurrentMonth: false });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
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
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const hour12 = hour % 12 || 12;
        const ampm = hour < 12 ? 'AM' : 'PM';
        const time12 = `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
        slots.push({ time24, time12 });
      }
    }
    return slots;
  }, []);

  // Format the selected date for the summary
  const formatSelectedSummary = () => {
    if (!selectedDate) return null;
    const dayName = DAY_NAMES_FULL[selectedDate.getDay()];
    const month = monthNames[selectedDate.getMonth()];
    const day = selectedDate.getDate();
    const slot = timeSlots.find(s => s.time24 === selectedTime);
    return `${dayName}, ${month} ${day} at ${slot?.time12 || selectedTime}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} size="md" isCentered>
      <ModalOverlay bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(4px)" />
      <ModalContent className="schedule-modal-geist schedule-modal-simple">
        <ModalHeader className="schedule-modal-header">
          Schedule Post
          <div className="schedule-modal-subtitle">
            Pick a date and time
          </div>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody className="schedule-modal-body">
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
          <div className="calendar-days">
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
                  <span className="best-time-popup-title">Best time for {bestTimePopup.dayName}s</span>
                  {bestTimePopup.hasToggle && (
                    <div className="best-time-popup-toggle">
                      <button
                        className={`toggle-btn ${popupSource === 'industry' ? 'active' : ''}`}
                        onClick={() => popupSource !== 'industry' && togglePopupSource()}
                      >
                        Industry
                      </button>
                      <button
                        className={`toggle-btn ${popupSource === 'yours' ? 'active' : ''}`}
                        onClick={() => popupSource !== 'yours' && togglePopupSource()}
                      >
                        Your Data
                      </button>
                    </div>
                  )}
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
                  {!bestTimePopup.hasToggle && (
                    <span className="best-time-popup-source">Based on {bestTimePopup.label}</span>
                  )}
                </div>
                <button className="best-time-popup-apply" onClick={applyRecommendedTime}>
                  Use {bestTimePopup.time}
                </button>
              </div>
            </div>
          )}

          {/* Time selector */}
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

          {/* Selected date/time summary */}
          {selectedDate && (
            <div className="schedule-summary">
              {formatSelectedSummary()}
            </div>
          )}
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
