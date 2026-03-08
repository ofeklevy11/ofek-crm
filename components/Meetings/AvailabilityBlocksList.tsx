"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Plus, Trash2, CalendarOff } from "lucide-react";
import { toast } from "sonner";

interface AvailabilityBlocksListProps {
  blocks: {
    id: number;
    title?: string | null;
    startDate: string | Date;
    endDate: string | Date;
    allDay: boolean;
  }[];
  onAdd: (data: {
    title?: string;
    startDate: string;
    endDate: string;
    allDay: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  onDelete: (id: number) => Promise<{ success: boolean; error?: string }>;
}

function formatHebrewDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function AvailabilityBlocksList({
  blocks,
  onAdd,
  onDelete,
}: AvailabilityBlocksListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const resetForm = useCallback(() => {
    setTitle("");
    setStartDate("");
    setEndDate("");
  }, []);

  const handleAdd = async () => {
    if (!startDate || !endDate) {
      toast.error("יש לבחור תאריך התחלה ותאריך סיום");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      toast.error("תאריך הסיום חייב להיות אחרי תאריך ההתחלה");
      return;
    }

    setLoading(true);
    try {
      const result = await onAdd({
        title: title.trim() || undefined,
        startDate,
        endDate,
        allDay: true,
      });
      if (result.success) {
        toast.success("החסימה נוספה בהצלחה");
        setDialogOpen(false);
        resetForm();
      } else {
        toast.error(result.error || "שגיאה בהוספת החסימה");
      }
    } catch {
      toast.error("שגיאה בהוספת החסימה");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const result = await onDelete(id);
      if (result.success) {
        toast.success("החסימה נמחקה בהצלחה");
      } else {
        toast.error(result.error || "שגיאה במחיקת החסימה");
      }
    } catch {
      toast.error("שגיאה במחיקת החסימה");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">חסימות זמינות</h3>
        <Button
          size="sm"
          className="gap-1.5 bg-blue-600 hover:bg-blue-700"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="size-4" />
          הוסף חסימה
        </Button>
      </div>

      {/* List */}
      {blocks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarOff className="h-6 w-6 text-white/60" />
            </EmptyMedia>
            <EmptyTitle className="text-white">אין חסימות</EmptyTitle>
            <EmptyDescription className="text-white/60">הוסיפו חסימות זמינות לתאריכים שבהם אינכם זמינים</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {blocks.map((block, idx) => (
            <div
              key={block.id}
              className="flex items-center justify-between rounded-xl border border-white/20 border-r-4 border-r-red-400/60 bg-[#162e22] backdrop-blur-sm p-3 hover:bg-white/[0.04] transition-shadow animate-cascade-in"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <div className="min-w-0 flex-1">
                {block.title && (
                  <p className="text-sm font-medium truncate text-white">{block.title}</p>
                )}
                <p className="text-sm text-white/60">
                  {formatHebrewDate(block.startDate)}
                  {" — "}
                  {formatHebrewDate(block.endDate)}
                </p>
              </div>
              <AlertDialog open={confirmDeleteId === block.id} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-400 hover:text-red-300 hover:bg-white/[0.08] shrink-0 mr-2"
                  disabled={deletingId === block.id}
                  onClick={() => setConfirmDeleteId(block.id)}
                  title="מחק חסימה"
                >
                  <Trash2 className="size-4" />
                </Button>
                <AlertDialogContent dir="rtl" className="bg-[#1a3a2a] border-white/20 text-white">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">מחיקת חסימה</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/50">האם למחוק את החסימה{block.title ? ` "${block.title}"` : ""}?</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-white/[0.08] border-white/20 text-white/80 hover:bg-white/[0.15] hover:text-white">ביטול</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(block.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-sm bg-[#1a3a2a] border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">הוסף חסימה</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block text-white/80">
                כותרת (אופציונלי)
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="חופשה, חג..."
                className="bg-white/[0.08] border-white/20 text-white placeholder:text-white/50 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block text-white/80">
                תאריך התחלה
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white/[0.08] border-white/20 text-white focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block text-white/80">
                תאריך סיום
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white/[0.08] border-white/20 text-white focus:ring-blue-500/50"
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleAdd} disabled={loading} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
              {loading ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
