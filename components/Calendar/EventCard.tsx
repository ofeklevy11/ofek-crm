import React from "react";
import { CalendarEvent } from "@/lib/types";

interface EventCardProps {
  event: CalendarEvent;
  onClick?: () => void;
  // For handling overlapping events - position within the column
  columnIndex?: number;
  totalColumns?: number;
  // For drag and drop
  onDragStart?: (event: CalendarEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}

export function EventCard({
  event,
  onClick,
  columnIndex = 0,
  totalColumns = 1,
  onDragStart,
  onDragEnd,
  isDragging = false,
}: EventCardProps) {
  const startHour =
    event.startTime.getHours() + event.startTime.getMinutes() / 60;
  const endHour = event.endTime.getHours() + event.endTime.getMinutes() / 60;
  const duration = endHour - startHour;

  const formatTime = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  // Calculate width and left position for overlapping events
  const widthPercent = 100 / totalColumns;
  // In RTL, we use "right" positioning instead of "left"
  const rightPercent = columnIndex * widthPercent;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    // Set drag data
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        eventId: event.id,
        duration: event.endTime.getTime() - event.startTime.getTime(),
      }),
    );
    e.dataTransfer.effectAllowed = "move";

    // Call the onDragStart callback
    onDragStart?.(event);
  };

  return (
    <div
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className={`absolute rounded-md px-2 py-1 text-white text-xs cursor-grab active:cursor-grabbing transition-all overflow-hidden shadow-sm z-10 ${
        isDragging ? "opacity-50 scale-95" : "hover:opacity-90"
      }`}
      style={{
        top: `calc(${startHour * 3.5}rem + 2px)`,
        height: `calc(${duration * 3.5}rem - 4px)`,
        backgroundColor: event.color || "#4285F4",
        minHeight: "1.75rem",
        // For overlapping events, calculate width and position
        width: `calc(${widthPercent}% - 12px)`,
        right: `calc(${rightPercent}% + 6px)`,
      }}
    >
      <div className="font-semibold truncate">{event.title}</div>
      {duration >= 1 && (
        <div className="text-[10px] opacity-90 mt-0.5">
          {formatTime(event.startTime)} - {formatTime(event.endTime)}
        </div>
      )}
    </div>
  );
}
