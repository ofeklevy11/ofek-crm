import React from "react";
import { CalendarEvent } from "@/lib/types";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

interface EventCardProps {
  event: CalendarEvent;
  onClick?: () => void;
  // For handling overlapping events - position within the column
  columnIndex?: number;
  totalColumns?: number;
  // For dnd-kit
  attributes?: any;
  listeners?: any;
  setNodeRef?: (node: HTMLElement | null) => void;
  transform?: any;
  isDragging?: boolean;
  isOverlay?: boolean;
  style?: React.CSSProperties;
}

export function EventCard({
  event,
  onClick,
  columnIndex = 0,
  totalColumns = 1,
  attributes,
  listeners,
  setNodeRef,
  transform,
  isDragging = false,
  isOverlay = false,
  style: styleProp,
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

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={`absolute rounded-md px-2 py-1 text-white text-xs cursor-grab active:cursor-grabbing transition-shadow overflow-hidden shadow-sm select-none ${
        isDragging && !isOverlay ? "opacity-30" : "hover:opacity-90"
      } ${isOverlay ? "z-50 shadow-xl scale-105" : "z-10"}`}
      style={{
        top: `calc(${startHour * 3.5}rem + 2px)`,
        height: `calc(${duration * 3.5}rem - 4px)`,
        backgroundColor: event.color || "#4285F4",
        minHeight: "1.75rem",
        // For overlapping events, calculate width and position
        width: `calc(${widthPercent}% - 12px)`,
        right: `calc(${rightPercent}% + 6px)`,
        transform: CSS.Translate.toString(transform),
        zIndex: isOverlay ? 50 : 10,
        touchAction: "manipulation", // Allow scrolling, but dnd-kit TouchSensor will handle drag after delay
        ...styleProp,
      }}
    >
      {duration >= 1 ? (
        <>
          <div className="font-semibold truncate">{event.title}</div>
          <div className="text-[10px] opacity-90 mt-0.5">
            {formatTime(event.startTime)} - {formatTime(event.endTime)}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-1 overflow-hidden h-full">
          <div className="font-semibold truncate">{event.title}</div>
          <div className="text-[10px] opacity-90 whitespace-nowrap">
            {formatTime(event.startTime)}
          </div>
        </div>
      )}
    </div>
  );
}

export function DraggableEventCard(props: EventCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: props.event.id,
      data: {
        type: "Event",
        event: props.event,
        duration:
          props.event.endTime.getTime() - props.event.startTime.getTime(),
      },
    });

  return (
    <EventCard
      {...props}
      setNodeRef={setNodeRef}
      transform={transform}
      attributes={attributes}
      listeners={listeners}
      isDragging={isDragging}
    />
  );
}
