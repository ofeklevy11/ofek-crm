"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import EditTableModal from "./EditTableModal";
import { showConfirm, showDestructiveConfirm } from "@/hooks/use-modal";
import Link from "next/link";
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  useEffect(() => {
    if (isEditModalOpen) {
      onModalOpen?.();
      return () => onModalClose?.();
    }
  }, [isEditModalOpen, onModalOpen, onModalClose]);

  // ---------------------------
  // Handlers
  // ---------------------------

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!(await showDestructiveConfirm({
      title: "מחיקת טבלה",
      message: `האם אתה בטוח שברצונך למחוק את "${table.name}"? פעולה זו תמחק לצמיתות את כל ${table._count.records} ${table._count.records === 1 ? "הרשומה" : "הרשומות"}, ולא ניתן יהיה לבטל אותה.`,
      confirmationPhrase: "מחק",
    }))) return;

    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/tables/${table.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed using default error");
      }

      toast.success("הטבלה נמחקה בהצלחה");
      router.push("/tables");
    } catch (error: any) {
      console.error(error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDuplicateClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!(await showConfirm({
      title: "שכפול טבלה",
      message: `האם אתה בטוח שברצונך לשכפל את הטבלה "${table.name}"? הטבלה החדשה תכלול את כל ${table._count.records} הרשומות והתצוגות.\n\n⚠️ שים לב: קבצים ולינקים המצורפים לרשומות לא ישוכפלו בטבלה החדשה.`,
    }))) return;

    setIsDuplicating(true);
    try {
      const result = await duplicateTable(table.id);

      if (!result.success) {
        throw new Error(result.error || "Failed to duplicate table");
      }

      toast.success("הטבלה שוכפלה בהצלחה");
      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsDuplicating(false);
    }
  };

  // ---------------------------
  // Render
  // ---------------------------

  return (
    <>
      <Link
        href={`/tables/${table.id}`}
        className="relative group bg-card rounded-xl shadow-sm hover:shadow-lg transition-all p-6 border border-border cursor-pointer hover:border-primary/20 block focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
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
        <div className="absolute bottom-4 left-4 md:bottom-auto md:top-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity flex gap-2 z-10">
          {canEdit && (
            <button
              onClick={handleEditClick}
              onPointerDown={(e) => e.stopPropagation()}
              className="bg-background text-muted-foreground hover:text-primary p-2 rounded-lg shadow-sm border border-border hover:border-primary transition"
              aria-label="ערוך טבלה"
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
              aria-label="שכפל טבלה"
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
              aria-label="מחק טבלה"
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
      </Link>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <EditTableModal
          tableId={table.id}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}

    </>
  );
}
