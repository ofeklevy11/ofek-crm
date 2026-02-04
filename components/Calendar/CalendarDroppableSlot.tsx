import React from "react";
import { useDroppable } from "@dnd-kit/core";

interface CalendarDroppableSlotProps {
  id: string;
  children: React.ReactNode;
  data: any;
  className?: string;
  isOverClassName?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function CalendarDroppableSlot({
  id,
  children,
  data,
  className,
  isOverClassName,
  onClick,
}: CalendarDroppableSlotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${
        isOver ? isOverClassName || "bg-blue-100" : ""
      }`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
