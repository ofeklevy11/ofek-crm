import React, { useState, useMemo } from "react";
import { daysOfWeek, isSameDay, TIME_SLOTS } from "@/lib/dateUtils";
import { getEventLayout } from "@/lib/calendar-layout";
import { CalendarEvent } from "@/lib/types";
import { EventCard, DraggableEventCard } from "./EventCard";
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
  onCreateEvent?: () => void;
}

export function DayView({
  currentDate,
  events,
  onEventClick,
  onTimeSlotClick,
  onEventDrop,
  onCreateEvent,
}: DayViewProps) {
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
  );

  const timeSlots = TIME_SLOTS;
  const today = new Date();
  const isToday = isSameDay(currentDate, today);

  // Filter events for this day
  const dayEvents = useMemo(
    () => events.filter((event) => isSameDay(event.startTime, currentDate)),
    [events, currentDate],
  );

  const layoutMap = useMemo(() => getEventLayout(dayEvents), [dayEvents]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveEvent(event.active.data.current?.event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id && onEventDrop) {
      const { hour, minutes } = over.data.current as {
        hour: number;
        minutes: number;
      };
      const duration = active.data.current?.duration as number;

      onEventDrop(active.id as string, currentDate, hour, minutes, duration);
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
                className="w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center md:hidden"
                aria-label="צור אירוע"
              >
                <svg
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
                {/* Background grid with borders and droppable time slots - split into halves */}
                {timeSlots.map((_, index) => {
                  const startHour = index;
                  const endHour = (index + 1) % 24;

                  return (
                    <div
                      key={`slot-${index}`}
                      className="h-14 border-b border-gray-100 relative z-0 flex flex-col"
                    >
                      {/* Top half - full hour */}
                      <CalendarDroppableSlot
                        id={`slot-${index}-0`}
                        data={{ hour: index, minutes: 0 }}
                        className="group flex-1 cursor-pointer transition-colors border-b border-dashed border-gray-200 relative hover:bg-blue-50"
                        isOverClassName="bg-blue-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTimeSlotClick?.(currentDate, index, 0);
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
                        id={`slot-${index}-30`}
                        data={{ hour: index, minutes: 30 }}
                        className="group flex-1 cursor-pointer transition-colors relative hover:bg-green-50"
                        isOverClassName="bg-green-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTimeSlotClick?.(currentDate, index, 30);
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
                {dayEvents.map((event) => {
                  const layoutInfo = layoutMap.get(event.id) || {
                    columnIndex: 0,
                    totalColumns: 1,
                  };
                  return (
                    <DraggableEventCard
                      key={event.id}
                      event={event}
                      onClick={() => onEventClick?.(event)}
                      columnIndex={layoutInfo.columnIndex}
                      totalColumns={layoutInfo.totalColumns}
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
                      (today.getHours() + today.getMinutes() / 60) *
                      3.5
                    }rem`,
                  }}
                >
                  <div className="absolute -right-1.5 -top-1.5 w-3 h-3 bg-red-500 rounded-full" />
                </div>
              )}
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
