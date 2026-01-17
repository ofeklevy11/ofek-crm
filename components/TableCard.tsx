"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EditTableModal from "./EditTableModal";
import AlertDialog from "./AlertDialog";
import { User, Pencil, Trash2 } from "lucide-react";

interface TableCardProps {
  table: {
    id: number;
    name: string;
    slug: string;
    createdAt: Date;
    _count: { records: number };
    creator: { name: string };
  };
  canDelete?: boolean;
  canEdit?: boolean;
}

export default function TableCard({
  table,
  canDelete = false,
  canEdit = false,
}: TableCardProps) {
  const router = useRouter();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ---------------------------
  // Handlers
  // ---------------------------

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/tables/${table.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed using default error");
      }

      router.push("/tables"); // ← מונע רינדורים כפולים
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Error deleting table");
    } finally {
      setIsDeleteDialogOpen(false);
      setIsDeleting(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // בלוק כשמקליקים על כפתור
    if (target.tagName === "BUTTON" || target.closest("button")) return;

    router.push(`/tables/${table.id}`);
  };

  // ---------------------------
  // Render
  // ---------------------------

  return (
    <>
      <div
        className="relative group bg-card rounded-xl shadow-sm hover:shadow-lg transition-all p-6 border border-border cursor-pointer hover:border-primary/20"
        onClick={handleCardClick}
        dir="rtl"
      >
        {/* Title + Slug */}
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-semibold text-card-foreground">
            {table.name}
          </h2>

          <span className="text-xs font-mono bg-muted text-muted-foreground py-1 px-2 rounded">
            {table.slug}
          </span>
        </div>

        {/* Records */}
        <p className="text-muted-foreground text-sm mb-4">
          {table._count.records}{" "}
          {table._count.records === 1 ? "רשומה" : "רשומות"}
        </p>

        {/* Created date */}
        <div className="text-xs text-muted-foreground mb-2">
          נוצר בתאריך {new Date(table.createdAt).toLocaleDateString("he-IL")}
        </div>

        {/* Creator Badge */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
          <User size={12} />
          נוצר על ידי {table.creator.name}
        </div>

        {/* Buttons (appear on hover) */}
        <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
          {canEdit && (
            <button
              onClick={handleEditClick}
              onPointerDown={(e) => e.stopPropagation()}
              className="bg-background text-muted-foreground hover:text-primary p-2 rounded-lg shadow-sm border border-border hover:border-primary transition"
              title="ערוך טבלה"
              disabled={isDeleting}
            >
              <Pencil size={16} />
            </button>
          )}

          {canDelete && (
            <button
              onClick={handleDeleteClick}
              onPointerDown={(e) => e.stopPropagation()}
              className="bg-background text-muted-foreground hover:text-destructive p-2 rounded-lg shadow-sm border border-border hover:border-destructive transition disabled:opacity-50"
              title="מחק טבלה"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <span className="animate-spin w-4 h-4 border-2 border-destructive border-t-transparent rounded-full block"></span>
              ) : (
                <Trash2 size={16} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <EditTableModal
        tableId={table.id}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
      />

      {/* Delete Dialog */}
      <AlertDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Table"
        description={`Are you sure you want to delete "${
          table.name
        }"? This will permanently delete all ${table._count.records} ${
          table._count.records === 1 ? "record" : "records"
        }, and this action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive
      />
    </>
  );
}
