"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableViewProps {
  id: number;
  children: React.ReactNode;
}

export default function SortableView({ id, children }: SortableViewProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Drag Handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="גרור לשינוי סדר"
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <div className="bg-gray-600 text-white p-2 rounded-lg shadow-lg hover:bg-gray-700 transition">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8h16M4 16h16"
            />
          </svg>
        </div>
      </button>

      {/* Content */}
      <div className={isDragging ? "shadow-2xl" : ""}>{children}</div>
    </div>
  );
}
