"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import GoalCard from "@/components/finance/GoalCard";
import { GoalWithProgress } from "@/app/actions/goals";

interface GoalWidgetProps {
  id: string; // The DND id
  goal: GoalWithProgress;
  metrics: any[];
  tables: any[];
  onRemove: () => void;
}

export default function GoalWidget({
  id,
  goal,
  metrics,
  tables,
  onRemove,
}: GoalWidgetProps) {
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
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative group h-full touch-none cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="h-full pointer-events-none">
        {/* Disable pointer events on the card while dragging/in general context of widget to ensure smooth drag? 
            Actually, we want to allow clicking buttons inside. 
            But Dnd-kit with generic listeners on the parent might hijack clicks.
            Usually simple buttons work fine, but if we want to be safe we can use a drag handle or ensure listeners dont block.
            
            However, AnalyticsWidget puts the listeners on the main div.
            Let's stick to that pattern.
        */}
        <div className="pointer-events-auto h-full">
          <GoalCard goal={goal} metrics={metrics} tables={tables} />
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onPointerDown={(e) => e.stopPropagation()} // Important: stop drag when clicking remove
        className="absolute top-2 left-2 bg-white/90 p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-500 z-10"
        title="הסר מהדאשבורד"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
