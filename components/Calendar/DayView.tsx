import React, { useState } from "react";
import { daysOfWeek, isSameDay, getTimeSlots } from "@/lib/dateUtils";
import { CalendarEvent } from "@/lib/types";
import { EventCard } from "./EventCard";

interface DayViewProps {
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

export function DayView({
  currentDate,
  events,
  onEventClick,
  onTimeSlotClick,
  onEventDrop,
  draggingEventId,
  onDragStart,
  onDragEnd,
}: DayViewProps) {
  const [dropTarget, setDropTarget] = useState<{
    hour: number;
    minutes: number;
  } | null>(null);
  const timeSlots = getTimeSlots();
  const today = new Date();
  const isToday = isSameDay(currentDate, today);

  // Filter events for this day
  const dayEvents = events.filter((event) =>
    isSameDay(event.startTime, currentDate),
  );

  // Helper function to check if two events overlap
  const eventsOverlap = (a: CalendarEvent, b: CalendarEvent): boolean => {
    return a.startTime < b.endTime && b.startTime < a.endTime;
  };

  // Calculate layout columns for overlapping events
  const getEventLayout = (
    events: CalendarEvent[],
  ): Map<string, { columnIndex: number; totalColumns: number }> => {
    const layout = new Map<
      string,
      { columnIndex: number; totalColumns: number }
    >();

    if (events.length === 0) return layout;

    // Sort events by start time, then by duration (longer first)
    const sortedEvents = [...events].sort((a, b) => {
      const startDiff = a.startTime.getTime() - b.startTime.getTime();
      if (startDiff !== 0) return startDiff;
      const aDuration = a.endTime.getTime() - a.startTime.getTime();
      const bDuration = b.endTime.getTime() - b.startTime.getTime();
      return bDuration - aDuration;
    });

    // Group overlapping events into collision groups
    const groups: CalendarEvent[][] = [];

    for (const event of sortedEvents) {
      let addedToGroup = false;

      for (const group of groups) {
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

      group.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      for (const event of group) {
        let placed = false;
        for (let colIdx = 0; colIdx < columns.length; colIdx++) {
          const column = columns[colIdx];
          const overlapsWithColumn = column.some((e) =>
            eventsOverlap(e, event),
          );
          if (!overlapsWithColumn) {
            column.push(event);
            layout.set(event.id, { columnIndex: colIdx, totalColumns: 0 });
            placed = true;
            break;
          }
        }

        if (!placed) {
          columns.push([event]);
          layout.set(event.id, {
            columnIndex: columns.length - 1,
            totalColumns: 0,
          });
        }
      }

      const totalColumns = columns.length;
      for (const event of group) {
        const info = layout.get(event.id)!;
        info.totalColumns = totalColumns;
      }
    }

    return layout;
  };

  const layoutMap = getEventLayout(dayEvents);

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
              {/* Background grid with borders and clickable time slots - split into halves */}
              {timeSlots.map((_, index) => {
                const startHourFull = index;
                const endHourFull = (index + 1) % 24;
                const endHourHalfActual = (index + 1) % 24;

                const isDropTargetTop =
                  dropTarget?.hour === index && dropTarget?.minutes === 0;
                const isDropTargetBottom =
                  dropTarget?.hour === index && dropTarget?.minutes === 30;

                const handleDragOver = (
                  e: React.DragEvent,
                  minutes: number,
                ) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropTarget({ hour: index, minutes });
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
                        currentDate,
                        index,
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
                    key={`slot-${index}`}
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
                        onTimeSlotClick?.(currentDate, index, 0);
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
                        onTimeSlotClick?.(currentDate, index, 30);
                      }}
                      onDragOver={(e) => handleDragOver(e, 30)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 30)}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-md shadow-sm font-medium whitespace-nowrap">
                          {index.toString().padStart(2, "0")}:30 עד{" "}
                          {endHourHalfActual.toString().padStart(2, "0")}:30
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Events overlay - positioned absolutely on top */}
              {dayEvents.map((event) => {
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
              })}
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
