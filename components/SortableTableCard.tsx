"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import TableCard from "./TableCard";

interface SortableTableCardProps {
  // We use the same 'table' type as TableCard
  table: any;
  canDelete?: boolean;
  canEdit?: boolean;
  disabled?: boolean;
  onModalOpen?: () => void;
  onModalClose?: () => void;
}

export default function SortableTableCard({
  table,
  canDelete,
  canEdit,
  disabled,
  onModalOpen,
  onModalClose,
}: SortableTableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: table.id,
    data: {
      type: "Table",
      table,
    },
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : "auto",
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="גרור לשינוי סדר"
        className="absolute right-2 top-4 z-10 cursor-grab active:cursor-grabbing opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity bg-background text-muted-foreground hover:text-foreground p-1.5 rounded-lg shadow-sm border border-border"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <TableCard
        table={table}
        canDelete={canDelete}
        canEdit={canEdit}
        onModalOpen={onModalOpen}
        onModalClose={onModalClose}
      />
    </div>
  );
}
