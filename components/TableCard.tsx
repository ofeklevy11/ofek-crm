"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import EditTableModal from "./EditTableModal";
import AlertDialog from "./AlertDialog";
import { User, Pencil, Trash2, Copy } from "lucide-react";
import { duplicateTable } from "@/app/actions/tables";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

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
  onModalOpen?: () => void;
  onModalClose?: () => void;
}

export default function TableCard({
  table,
  canDelete = false,
  canEdit = false,
  onModalOpen,
  onModalClose,
}: TableCardProps) {
  const router = useRouter();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Monitor any open modal
  const isAnyModalOpen =
    isEditModalOpen || isDeleteDialogOpen || isDuplicateDialogOpen;

  useEffect(() => {
    if (isAnyModalOpen) {
      onModalOpen?.();
      return () => onModalClose?.();
    }
  }, [isAnyModalOpen, onModalOpen, onModalClose]);

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

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDuplicateDialogOpen(true);
  };

  const handleConfirmDuplicate = async () => {
    setIsDuplicating(true);

    try {
      const result = await duplicateTable(table.id);

      if (!result.success) {
        throw new Error(result.error || "Failed to duplicate table");
      }

      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsDuplicateDialogOpen(false);
      setIsDuplicating(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);

    try {
      const res = await apiFetch(`/api/tables/${table.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed using default error");
      }

      router.push("/tables"); // ← מונע רינדורים כפולים
    } catch (error: any) {
      console.error(error);
      toast.error(getUserFriendlyError(error));
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
        <div className="absolute top-4 left-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex gap-2 z-10">
          {canEdit && (
            <button
              onClick={handleEditClick}
              onPointerDown={(e) => e.stopPropagation()}
              className="bg-background text-muted-foreground hover:text-primary p-2 rounded-lg shadow-sm border border-border hover:border-primary transition"
              title="ערוך טבלה"
              disabled={isDeleting || isDuplicating}
            >
              <Pencil size={16} />
            </button>
          )}

          {canEdit && (
            <button
              onClick={handleDuplicateClick}
              onPointerDown={(e) => e.stopPropagation()}
              className="bg-background text-muted-foreground hover:text-purple-500 p-2 rounded-lg shadow-sm border border-border hover:border-purple-500 transition disabled:opacity-50"
              title="שכפל טבלה"
              disabled={isDeleting || isDuplicating}
            >
              {isDuplicating ? (
                <span className="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full block"></span>
              ) : (
                <Copy size={16} />
              )}
            </button>
          )}

          {canDelete && (
            <button
              onClick={handleDeleteClick}
              onPointerDown={(e) => e.stopPropagation()}
              className="bg-background text-muted-foreground hover:text-destructive p-2 rounded-lg shadow-sm border border-border hover:border-destructive transition disabled:opacity-50"
              title="מחק טבלה"
              disabled={isDeleting || isDuplicating}
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
      {isEditModalOpen && (
        <EditTableModal
          tableId={table.id}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}

      {/* Delete Dialog */}
      <AlertDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="מחיקת טבלה"
        description={`האם אתה בטוח שברצונך למחוק את "${table.name}"? פעולה זו תמחק לצמיתות את כל ${table._count.records} ${
          table._count.records === 1 ? "הרשומה" : "הרשומות"
        }, ולא ניתן יהיה לבטל אותה.`}
        confirmText="מחק"
        cancelText="ביטול"
        isDestructive
      />

      {/* Duplicate Dialog */}
      <AlertDialog
        isOpen={isDuplicateDialogOpen}
        onClose={() => setIsDuplicateDialogOpen(false)}
        onConfirm={handleConfirmDuplicate}
        title="שכפול טבלה"
        description={
          <div className="space-y-3">
            <p>
              האם אתה בטוח שברצונך לשכפל את הטבלה "{table.name}"? הטבלה החדשה
              תכלול את כל {table._count.records} הרשומות והתצוגות.
            </p>
            <div className="text-destructive font-medium bg-destructive/10 p-3 rounded-md border border-destructive/20 text-sm">
              ⚠️ שים לב: קבצים ולינקים המצורפים לרשומות לא ישוכפלו בטבלה החדשה.
            </div>
          </div>
        }
        confirmText="שכפל"
        cancelText="ביטול"
      />
    </>
  );
}
