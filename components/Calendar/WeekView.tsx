import React from "react";
import {
  getStartOfWeek,
  addDays,
  daysOfWeek,
  isSameDay,
  getTimeSlots,
} from "@/lib/dateUtils";
import { CalendarEvent } from "@/lib/types";
import { EventCard } from "./EventCard";

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (date: Date, hour: number) => void;
}

export function WeekView({
  currentDate,
  events,
  onEventClick,
  onTimeSlotClick,
}: WeekViewProps) {
  const startOfWeek = getStartOfWeek(currentDate);
  const weekDates = Array.from({ length: 7 }, (_, i) =>
    addDays(startOfWeek, i)
  );
  const timeSlots = getTimeSlots();
  const today = new Date();

  // Group events by day
  const eventsByDay = weekDates.map((date) =>
    events.filter((event) => isSameDay(event.startTime, date))
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header Row */}
      <div className="flex border-b border-gray-200">
        <div className="w-16 shrink-0 border-r border-gray-100 bg-white" />{" "}
        {/* Time column spacer */}
        <div className="flex flex-1">
          {weekDates.map((date, index) => {
            const isToday = isSameDay(date, today);
            return (
              <div
                key={index}
                className="flex-1 py-3 text-center border-r border-gray-100 last:border-r-0"
              >
                <div
                  className={`text-xs font-medium mb-1 ${
                    isToday ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  {daysOfWeek[date.getDay()].toUpperCase()}
                </div>
                <div
                  className={`inline-flex items-center justify-center w-8 h-8 text-lg rounded-full ${
                    isToday
                      ? "bg-blue-600 text-white"
                      : "text-gray-800 group-hover:bg-gray-100"
                  }`}
                >
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex relative min-h-[600px]">
          {/* Time Column */}
          <div className="w-16 shrink-0 border-r border-gray-100 bg-white select-none">
            {timeSlots.map((time, index) => (
              <div key={index} className="h-14 relative">
                <span className="absolute -top-2.5 right-2 text-xs text-gray-400">
                  {time}
                </span>
              </div>
            ))}
          </div>

          {/* Days Columns */}
          <div className="flex flex-1 relative">
            {/* Vertical Day Columns */}
            {weekDates.map((date, dayIndex) => (
              <div
                key={dayIndex}
                className="flex-1 border-r border-gray-100 last:border-r-0 relative h-[calc(24*3.5rem)]"
              >
                {/* Clickable Time Slots background */}
                {timeSlots.map((_, hourIndex) => (
                  <div
                    key={`slot-${dayIndex}-${hourIndex}`}
                    className="h-14 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors relative z-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTimeSlotClick?.(date, hourIndex);
                    }}
                  />
                ))}

                {/* Events overlay - positioned absolutely on top */}
                {eventsByDay[dayIndex].map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onClick={() => onEventClick?.(event)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
