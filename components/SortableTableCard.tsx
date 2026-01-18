"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
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
