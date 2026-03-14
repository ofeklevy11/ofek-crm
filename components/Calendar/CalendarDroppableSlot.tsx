import React from "react";
import { useDroppable } from "@dnd-kit/core";

interface CalendarDroppableSlotProps {
  id: string;
  children: React.ReactNode;
  data: any;
  className?: string;
  isOverClassName?: string;
  onClick?: (e: React.MouseEvent) => void;
  ariaLabel?: string;
}

export function CalendarDroppableSlot({
  id,
  children,
  data,
  className,
  isOverClassName,
  onClick,
  ariaLabel,
}: CalendarDroppableSlotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data,
  });

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      className={`${className} ${
        isOver ? isOverClassName || "bg-blue-100" : ""
      } focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset`}
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
    >
      {children}
    </div>
  );
}
