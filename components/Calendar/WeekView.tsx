import React, { useState, useMemo } from "react";
import {
  getStartOfWeek,
  addDays,
  daysOfWeek,
  isSameDay,
  TIME_SLOTS,
} from "@/lib/dateUtils";
import { getEventLayout } from "@/lib/calendar-layout";
import { CalendarEvent } from "@/lib/types";
import { EventCard, DraggableEventCard, GoogleEventCard } from "./EventCard";
import { CalendarDroppableSlot } from "./CalendarDroppableSlot";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (date: Date, hour: number, minutes: number) => void;
  onEventDrop?: (
    eventId: string,
    newDate: Date,
    newHour: number,
    newMinutes: number,
    duration: number,
  ) => void;
  onCreateEvent?: () => void;
}

export function WeekView({
  currentDate,
  events,
  onEventClick,
  onTimeSlotClick,
  onEventDrop,
  onCreateEvent,
}: WeekViewProps) {
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    }),
    // Keyboard drag-and-drop not supported for calendar grids (no coordinateGetter).
    // Keyboard users create/edit events via the floating button + modal.
  );

  const weekDates = useMemo(() => {
    const start = getStartOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);
  const timeSlots = TIME_SLOTS;
  const today = new Date();

  // Build aria-label for the grid with date range
  const gridAriaLabel = useMemo(() => {
    const first = weekDates[0];
    const last = weekDates[6];
    return `לוח שבועי, ${first.toLocaleDateString("he-IL")} עד ${last.toLocaleDateString("he-IL")}`;
  }, [weekDates]);

  // Group events by day using Map-based single-pass grouping
  const eventsByDay = useMemo(() => {
    const byDayKey = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = `${event.startTime.getFullYear()}-${event.startTime.getMonth()}-${event.startTime.getDate()}`;
      const arr = byDayKey.get(key) || [];
      arr.push(event);
      byDayKey.set(key, arr);
    }
    return weekDates.map((date) => {
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      return byDayKey.get(key) || [];
    });
  }, [events, weekDates]);

  // Pre-compute all layouts (avoids recalculating inside JSX per day)
  const eventLayouts = useMemo(() => {
    return eventsByDay.map((dayEvents) => getEventLayout(dayEvents));
  }, [eventsByDay]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveEvent(event.active.data.current?.event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id && onEventDrop) {
      const { dayIndex, hour, minutes } = over.data.current as {
        dayIndex: number;
        hour: number;
        minutes: number;
      };
      const duration = active.data.current?.duration as number;
      const targetDate = weekDates[dayIndex];

      onEventDrop(active.id as string, targetDate, hour, minutes, duration);
    }

    setActiveEvent(null);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full overflow-hidden bg-white">
        {/* Header Row */}
        <div className="flex border-b border-gray-200">
          <div className="w-16 shrink-0 border-l border-gray-100 bg-white flex items-center justify-center">
            {onCreateEvent && (
              <button
                onClick={onCreateEvent}
                className="w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center md:hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                aria-label="צור אירוע"
              >
                <svg
                  aria-hidden="true"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            )}
          </div>{" "}
          {/* Time column spacer */}
          <div className="flex flex-1">
            {weekDates.map((date, index) => {
              const isToday = isSameDay(date, today);
              return (
                <div
                  key={index}
                  className="flex-1 py-3 text-center border-l border-gray-100 last:border-l-0"
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
          <div className="flex relative min-h-[600px]" role="region" aria-label={gridAriaLabel}>
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

            {/* Days Columns */}
            <div className="flex flex-1 relative">
              {/* Vertical Day Columns */}
              {weekDates.map((date, dayIndex) => (
                <div
                  key={dayIndex}
                  className="flex-1 border-l border-gray-100 last:border-l-0 relative h-[calc(24*3.5rem)]"
                >
                  {/* Clickable Time Slots background - split into halves */}
                  {timeSlots.map((_, hourIndex) => {
                    const startHour = hourIndex;
                    const endHour = (hourIndex + 1) % 24;
                    const dayName = daysOfWeek[date.getDay()];

                    return (
                      <div
                        key={`slot-${dayIndex}-${hourIndex}`}
                        className="h-14 border-b border-gray-100 relative z-0 flex flex-col"
                      >
                        {/* Top half - full hour */}
                        <CalendarDroppableSlot
                          id={`slot-${dayIndex}-${hourIndex}-0`}
                          data={{ dayIndex, hour: hourIndex, minutes: 0 }}
                          className="group flex-1 cursor-pointer transition-colors border-b border-dashed border-gray-200 relative hover:bg-blue-50"
                          isOverClassName="bg-blue-100"
                          ariaLabel={`${dayName} ${startHour.toString().padStart(2, "0")}:00`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTimeSlotClick?.(date, hourIndex, 0);
                          }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-md shadow-sm font-medium whitespace-nowrap">
                              {startHour.toString().padStart(2, "0")}:00 עד{" "}
                              {endHour.toString().padStart(2, "0")}:00
                            </span>
                          </div>
                        </CalendarDroppableSlot>

                        {/* Bottom half - half hour */}
                        <CalendarDroppableSlot
                          id={`slot-${dayIndex}-${hourIndex}-30`}
                          data={{ dayIndex, hour: hourIndex, minutes: 30 }}
                          className="group flex-1 cursor-pointer transition-colors relative hover:bg-green-50"
                          isOverClassName="bg-green-100"
                          ariaLabel={`${dayName} ${startHour.toString().padStart(2, "0")}:30`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTimeSlotClick?.(date, hourIndex, 30);
                          }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-md shadow-sm font-medium whitespace-nowrap">
                              {startHour.toString().padStart(2, "0")}:30 עד{" "}
                              {endHour.toString().padStart(2, "0")}:30
                            </span>
                          </div>
                        </CalendarDroppableSlot>
                      </div>
                    );
                  })}

                  {/* Events overlay - positioned absolutely on top */}
                  {eventsByDay[dayIndex].map((event) => {
                    const layoutInfo = eventLayouts[dayIndex].get(event.id) || {
                      columnIndex: 0,
                      totalColumns: 1,
                    };
                    const CardComponent = event.source === "google" ? GoogleEventCard : DraggableEventCard;
                    return (
                      <CardComponent
                        key={event.id}
                        event={event}
                        onClick={() => onEventClick?.(event)}
                        columnIndex={layoutInfo.columnIndex}
                        totalColumns={layoutInfo.totalColumns}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeEvent ? (
            <EventCard
              event={activeEvent}
              isOverlay
              columnIndex={0}
              totalColumns={1}
              style={{ top: 0, right: 0 }}
            />
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
