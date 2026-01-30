"use client";

import { useEffect, useState } from "react";
import { GoalWithProgress, updateGoalOrder } from "@/app/actions/goals";
import GoalCard from "./GoalCard";
import { AlertCircle } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface GoalListProps {
  goals: GoalWithProgress[];
  metrics: any[];
  tables: any[];
}

function SortableGoalItem({
  goal,
  metrics,
  tables,
  isDropdownOpen,
  onDropdownOpenChange,
}: {
  goal: GoalWithProgress;
  metrics: any[];
  tables: any[];
  isDropdownOpen: boolean;
  onDropdownOpenChange: (open: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: goal.id });

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
      className={`touch-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
    >
      <div className="pointer-events-auto">
        {/* GoalCard handles its own pointer events for buttons, but dragging starts on non-interactive areas if configured correctly.
             However, dnd-kit listeners on the parent div usually capturing all pointer events.
             We might need a drag handle or rely on sensors safe-guards.
             PointerSensor with distance constraint is usually best for mixed content.
         */}
        <GoalCard
          goal={goal}
          metrics={metrics}
          tables={tables}
          isDropdownOpen={isDropdownOpen}
          onDropdownOpenChange={onDropdownOpenChange}
        />
      </div>
    </div>
  );
}

export default function GoalList({ goals, metrics, tables }: GoalListProps) {
  const [items, setItems] = useState<GoalWithProgress[]>(goals);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);

  useEffect(() => {
    setItems(goals);
  }, [goals]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts to allow clicks
      },
    }),
    // KeyboardSensor removed to prevent Space key from triggering drag when editing goals
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(prev, oldIndex, newIndex);

        // Optimistic update done, iterate and send to server
        updateGoalOrder(newItems.map((g) => g.id));

        return newItems;
      });
    }
  };

  if (goals.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
        <div className="mx-auto w-12 h-12 bg-[#4f95ff]/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-[#4f95ff]" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">
          עדיין לא הוגדרו יעדים
        </h3>
        <p className="text-gray-500 mt-2 max-w-sm mx-auto">
          התחל לתכנן את ההצלחה העסקית שלך על ידי הגדרת יעדים ברורים ומדידים.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={rectSortingStrategy}
      >
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6"
          dir="rtl"
        >
          {items.map((goal) => (
            <SortableGoalItem
              key={goal.id}
              goal={goal}
              metrics={metrics}
              tables={tables}
              isDropdownOpen={openDropdownId === goal.id}
              onDropdownOpenChange={(open) =>
                setOpenDropdownId(open ? goal.id : null)
              }
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
