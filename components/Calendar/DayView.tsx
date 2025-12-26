import React from "react";
import { daysOfWeek, isSameDay, getTimeSlots } from "@/lib/dateUtils";
import { CalendarEvent } from "@/lib/types";
import { EventCard } from "./EventCard";

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (date: Date, hour: number) => void;
}

export function DayView({
  currentDate,
  events,
  onEventClick,
  onTimeSlotClick,
}: DayViewProps) {
  const timeSlots = getTimeSlots();
  const today = new Date();
  const isToday = isSameDay(currentDate, today);

  // Filter events for this day
  const dayEvents = events.filter((event) =>
    isSameDay(event.startTime, currentDate)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header Row */}
      <div className="flex border-b border-gray-200">
        <div className="w-16 shrink-0 border-l border-gray-100 bg-white" />{" "}
        {/* Time column spacer */}
        <div className="flex-1 py-3 text-center">
          <div
            className={`text-xs font-medium mb-1 ${
              isToday ? "text-blue-600" : "text-gray-500"
            }`}
          >
            {daysOfWeek[currentDate.getDay()].toUpperCase()}
          </div>
          <div
            className={`inline-flex items-center justify-center w-10 h-10 text-xl rounded-full ${
              isToday ? "bg-blue-600 text-white" : "text-gray-800"
            }`}
          >
            {currentDate.getDate()}
          </div>
        </div>
      </div>

      {/* Scrollable Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex relative min-h-[600px]">
          {/* Time Column */}
          <div className="w-16 shrink-0 border-l border-gray-100 bg-white select-none">
            {timeSlots.map((time, index) => (
              <div key={index} className="h-14 relative">
                <span className="absolute -top-2.5 left-2 text-xs text-gray-400">
                  {time}
                </span>
              </div>
            ))}
          </div>

          {/* Day Column */}
          <div className="flex-1 relative">
            {/* Main Day Column Content */}
            <div className="relative h-[calc(24*3.5rem)]">
              {/* Background grid with borders and clickable time slots */}
              {timeSlots.map((_, index) => (
                <div
                  key={`slot-${index}`}
                  className="h-14 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors relative z-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTimeSlotClick?.(currentDate, index);
                  }}
                />
              ))}

              {/* Events overlay - positioned absolutely on top */}
              {dayEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onClick={() => onEventClick?.(event)}
                />
              ))}
            </div>

            {/* Current Time Indicator (if today) */}
            {isToday && (
              <div
                className="absolute left-0 right-0 h-0.5 bg-red-500 z-20 pointer-events-none"
                style={{
                  top: `${
                    (new Date().getHours() + new Date().getMinutes() / 60) * 3.5
                  }rem`,
                }}
              >
                <div className="absolute -right-1.5 -top-1.5 w-3 h-3 bg-red-500 rounded-full" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
