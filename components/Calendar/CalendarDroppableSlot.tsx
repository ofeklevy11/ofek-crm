import React from "react";
import { useDroppable } from "@dnd-kit/core";

interface CalendarDroppableSlotProps {
  id: string;
  children: React.ReactNode;
  data: any;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function CalendarDroppableSlot({
  id,
  children,
  data,
  className,
  onClick,
}: CalendarDroppableSlotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "bg-opacity-50" : ""}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
