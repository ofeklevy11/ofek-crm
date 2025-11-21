import React from "react";
import { CalendarEvent } from "@/lib/types";

interface EventCardProps {
  event: CalendarEvent;
  onClick?: () => void;
}

export function EventCard({ event, onClick }: EventCardProps) {
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

  return (
    <div
      onClick={onClick}
      className="absolute left-1 right-1 rounded-md px-2 py-1 text-white text-xs cursor-pointer hover:opacity-90 transition-opacity overflow-hidden shadow-sm"
      style={{
        top: `${startHour * 3.5}rem`,
        height: `${duration * 3.5}rem`,
        backgroundColor: event.color || "#4285F4",
        minHeight: "1.75rem",
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
