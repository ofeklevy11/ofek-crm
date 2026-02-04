import React, { useState } from "react";
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
  onTimeSlotClick?: (date: Date, hour: number, minutes: number) => void;
  onEventDrop?: (
    eventId: string,
    newDate: Date,
    newHour: number,
    newMinutes: number,
    duration: number,
  ) => void;
  draggingEventId?: string | null;
  onDragStart?: (event: CalendarEvent) => void;
  onDragEnd?: () => void;
}

export function WeekView({
  currentDate,
  events,
  onEventClick,
  onTimeSlotClick,
  onEventDrop,
  draggingEventId,
  onDragStart,
  onDragEnd,
}: WeekViewProps) {
  const [dropTarget, setDropTarget] = useState<{
    dayIndex: number;
    hour: number;
    minutes: number;
  } | null>(null);
  const startOfWeek = getStartOfWeek(currentDate);
  const weekDates = Array.from({ length: 7 }, (_, i) =>
    addDays(startOfWeek, i),
  );
  const timeSlots = getTimeSlots();
  const today = new Date();

  // Group events by day
  const eventsByDay = weekDates.map((date) =>
    events.filter((event) => isSameDay(event.startTime, date)),
  );

  // Helper function to check if two events overlap
  const eventsOverlap = (a: CalendarEvent, b: CalendarEvent): boolean => {
    return a.startTime < b.endTime && b.startTime < a.endTime;
  };

  // Calculate layout columns for overlapping events
  const getEventLayout = (
    dayEvents: CalendarEvent[],
  ): Map<string, { columnIndex: number; totalColumns: number }> => {
    const layout = new Map<
      string,
      { columnIndex: number; totalColumns: number }
    >();

    if (dayEvents.length === 0) return layout;

    // Sort events by start time, then by duration (longer first)
    const sortedEvents = [...dayEvents].sort((a, b) => {
      const startDiff = a.startTime.getTime() - b.startTime.getTime();
      if (startDiff !== 0) return startDiff;
      // If same start time, longer events first
      const aDuration = a.endTime.getTime() - a.startTime.getTime();
      const bDuration = b.endTime.getTime() - b.startTime.getTime();
      return bDuration - aDuration;
    });

    // Group overlapping events into collision groups
    const groups: CalendarEvent[][] = [];

    for (const event of sortedEvents) {
      let addedToGroup = false;

      for (const group of groups) {
        // Check if this event overlaps with any event in the group
        const overlapsWithGroup = group.some((e) => eventsOverlap(e, event));
        if (overlapsWithGroup) {
          group.push(event);
          addedToGroup = true;
          break;
        }
      }

      if (!addedToGroup) {
        groups.push([event]);
      }
    }

    // Merge groups that share events (transitively connected)
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          // Check if any event in group i overlaps with any event in group j
          const shouldMerge = groups[i].some((ei) =>
            groups[j].some((ej) => eventsOverlap(ei, ej)),
          );
          if (shouldMerge) {
            groups[i].push(...groups[j]);
            groups.splice(j, 1);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    // Assign columns within each group
    for (const group of groups) {
      const columns: CalendarEvent[][] = [];

      // Sort group by start time
      group.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      for (const event of group) {
        // Find the first column where this event can fit
        let placed = false;
        for (let colIdx = 0; colIdx < columns.length; colIdx++) {
          const column = columns[colIdx];
          // Check if event overlaps with any event in this column
          const overlapsWithColumn = column.some((e) =>
            eventsOverlap(e, event),
          );
          if (!overlapsWithColumn) {
            column.push(event);
            layout.set(event.id, { columnIndex: colIdx, totalColumns: 0 }); // totalColumns set later
            placed = true;
            break;
          }
        }

        if (!placed) {
          // Create new column
          columns.push([event]);
          layout.set(event.id, {
            columnIndex: columns.length - 1,
            totalColumns: 0,
          });
        }
      }

      // Update totalColumns for all events in this group
      const totalColumns = columns.length;
      for (const event of group) {
        const info = layout.get(event.id)!;
        info.totalColumns = totalColumns;
      }
    }

    return layout;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header Row */}
      <div className="flex border-b border-gray-200">
        <div className="w-16 shrink-0 border-l border-gray-100 bg-white" />{" "}
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
                  const startHourFull = hourIndex;
                  const endHourFull = (hourIndex + 1) % 24;
                  const startHourHalf = hourIndex;
                  // For half-hour: starts at hourIndex:30, ends at (hourIndex+1):30
                  const endHourHalfActual = (hourIndex + 1) % 24;

                  const isDropTargetTop =
                    dropTarget?.dayIndex === dayIndex &&
                    dropTarget?.hour === hourIndex &&
                    dropTarget?.minutes === 0;
                  const isDropTargetBottom =
                    dropTarget?.dayIndex === dayIndex &&
                    dropTarget?.hour === hourIndex &&
                    dropTarget?.minutes === 30;

                  const handleDragOver = (
                    e: React.DragEvent,
                    minutes: number,
                  ) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropTarget({ dayIndex, hour: hourIndex, minutes });
                  };

                  const handleDragLeave = () => {
                    setDropTarget(null);
                  };

                  const handleDrop = (e: React.DragEvent, minutes: number) => {
                    e.preventDefault();
                    setDropTarget(null);

                    try {
                      const data = JSON.parse(
                        e.dataTransfer.getData("application/json"),
                      );
                      if (data.eventId && onEventDrop) {
                        onEventDrop(
                          data.eventId,
                          date,
                          hourIndex,
                          minutes,
                          data.duration,
                        );
                      }
                    } catch (err) {
                      console.error("Failed to parse drag data:", err);
                    }
                    onDragEnd?.();
                  };

                  return (
                    <div
                      key={`slot-${dayIndex}-${hourIndex}`}
                      className="h-14 border-b border-gray-100 relative z-0 flex flex-col"
                    >
                      {/* Top half - full hour (e.g., 10:00 - 11:00) */}
                      <div
                        className={`group flex-1 cursor-pointer transition-colors border-b border-dashed border-gray-200 relative ${
                          isDropTargetTop
                            ? "bg-blue-200 ring-2 ring-blue-400 ring-inset"
                            : "hover:bg-blue-100"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTimeSlotClick?.(date, hourIndex, 0);
                        }}
                        onDragOver={(e) => handleDragOver(e, 0)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, 0)}
                      >
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-md shadow-sm font-medium whitespace-nowrap">
                            {startHourFull.toString().padStart(2, "0")}:00 עד{" "}
                            {endHourFull.toString().padStart(2, "0")}:00
                          </span>
                        </div>
                      </div>
                      {/* Bottom half - half hour (e.g., 10:30 - 11:30) */}
                      <div
                        className={`group flex-1 cursor-pointer transition-colors relative ${
                          isDropTargetBottom
                            ? "bg-green-200 ring-2 ring-green-400 ring-inset"
                            : "hover:bg-green-100"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTimeSlotClick?.(date, hourIndex, 30);
                        }}
                        onDragOver={(e) => handleDragOver(e, 30)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, 30)}
                      >
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-md shadow-sm font-medium whitespace-nowrap">
                            {startHourHalf.toString().padStart(2, "0")}:30 עד{" "}
                            {endHourHalfActual.toString().padStart(2, "0")}:30
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Events overlay - positioned absolutely on top */}
                {(() => {
                  const dayEvents = eventsByDay[dayIndex];
                  const layoutMap = getEventLayout(dayEvents);
                  return dayEvents.map((event) => {
                    const layoutInfo = layoutMap.get(event.id) || {
                      columnIndex: 0,
                      totalColumns: 1,
                    };
                    return (
                      <EventCard
                        key={event.id}
                        event={event}
                        onClick={() => onEventClick?.(event)}
                        columnIndex={layoutInfo.columnIndex}
                        totalColumns={layoutInfo.totalColumns}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        isDragging={draggingEventId === event.id}
                      />
                    );
                  });
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
