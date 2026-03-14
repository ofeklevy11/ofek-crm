"use client";

import { useEffect, useState } from "react";
import { GoalWithProgress, updateGoalOrder } from "@/app/actions/goals";
import GoalCard from "./GoalCard";
import { AlertCircle, GripVertical, Plus } from "lucide-react";
import GoalModal from "./GoalModal";
import { Button } from "@/components/ui/button";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";

interface GoalListProps {
  goals: GoalWithProgress[];
  metrics: any[];
  tables: any[];
  clients: any[];
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
    zIndex: isDragging ? 50 : "auto" as const,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
      aria-roledescription="פריט ניתן לגרירה"
    >
      <button
        className="absolute top-2 left-2 z-10 p-1.5 rounded-md bg-white/80 border border-gray-200 hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-[#4f95ff] focus-visible:outline-none"
        aria-label="גרור לשינוי סדר"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" aria-hidden="true" />
      </button>
      <GoalCard
        goal={goal}
        metrics={metrics}
        tables={tables}
        isDropdownOpen={isDropdownOpen}
        onDropdownOpenChange={onDropdownOpenChange}
      />
    </div>
  );
}

export default function GoalList({ goals, metrics, tables, clients }: GoalListProps) {
  const [items, setItems] = useState<GoalWithProgress[]>(goals);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    setItems(goals);
  }, [goals]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts to allow clicks
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      const newItems = arrayMove(items, oldIndex, newIndex);
      const previousItems = items;
      setItems(newItems);
      setStatusMessage(`יעד הועבר למיקום ${newIndex + 1}`);

      try {
        await updateGoalOrder(newItems.map((g) => g.id));
      } catch {
        setItems(previousItems);
        setStatusMessage("שגיאה בעדכון הסדר");
        toast.error("\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E2\u05D3\u05DB\u05D5\u05DF \u05D4\u05E1\u05D3\u05E8");
      }
    }
  };

  if (goals.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
        <div className="mx-auto w-12 h-12 bg-[#4f95ff]/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-[#4f95ff]" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">
          עדיין לא הוגדרו יעדים
        </h3>
        <p className="text-gray-500 mt-2 max-w-sm mx-auto">
          התחל לתכנן את ההצלחה העסקית שלך על ידי הגדרת יעדים ברורים ומדידים.
        </p>
        <GoalModal
          metrics={metrics}
          tables={tables}
          clients={clients}
          trigger={
            <Button className="mt-4 gap-2 bg-[#4f95ff] hover:bg-[#3d7ccc] text-white">
              <Plus className="w-4 h-4" aria-hidden="true" />
              צור את היעד הראשון שלך
            </Button>
          }
        />
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
        <p className="sr-only">
          השתמש במקש רווח כדי להתחיל גרירה. בזמן גרירה, השתמש בחיצי המקלדת כדי להזיז את הפריט. לחץ רווח שוב כדי לשחרר.
        </p>
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
        <div aria-live="polite" className="sr-only">{statusMessage}</div>
      </SortableContext>
    </DndContext>
  );
}
