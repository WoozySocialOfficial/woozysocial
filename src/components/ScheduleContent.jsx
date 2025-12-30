import React, { useState } from "react";
import "./ScheduleContent.css";

export const ScheduleContent = () => {
  const [currentDate] = useState(new Date());

  // Get week dates starting from today
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

  const weekDates = getWeekDates();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Generate time slots from 6 AM to 11 PM
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 6; hour <= 23; hour++) {
      const time = hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`;
      slots.push({ hour, time });
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  return (
    <div className="schedule-container">
      <div className="schedule-header">
        <h1 className="page-title">Schedule</h1>
        <p className="page-subtitle">Keep track of your planned posts</p>
      </div>

      <div className="schedule-tabs">
        <button className="schedule-tab active">Schedule</button>
        <button className="schedule-tab">Plan</button>
      </div>

      <div className="schedule-view">
        <div className="schedule-filters">
          <button className="filter-btn active">Week</button>
          <button className="filter-btn">Month</button>
          <button className="filter-btn">Kanban</button>
        </div>

        <div className="week-view">
          <div className="time-column">
            <div className="time-header"></div>
            {timeSlots.map((slot, index) => (
              <div key={index} className="time-slot">
                {slot.time}
              </div>
            ))}
          </div>

          {weekDates.map((date, dayIndex) => (
            <div key={dayIndex} className="day-column">
              <div className="day-header">
                <div className="day-name">{dayNames[date.getDay()]}</div>
                <div className="day-date">
                  {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              {timeSlots.map((slot, slotIndex) => (
                <div key={slotIndex} className="schedule-cell"></div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="schedule-legend">
        <div className="legend-item">
          <div className="legend-dot scheduled"></div>
          <span>Scheduled Posts</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot published"></div>
          <span>Published</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot drafts"></div>
          <span>Drafts</span>
        </div>
      </div>
    </div>
  );
};
