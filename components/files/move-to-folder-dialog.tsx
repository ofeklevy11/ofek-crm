"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Folder, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { moveFileToFolder } from "@/app/actions/storage";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface MoveToFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: number;
  fileName: string;
  folders: { id: number; name: string }[];
  currentFolderId: number | null;
}

export function MoveToFolderDialog({
  open,
  onOpenChange,
  fileId,
  fileName,
  folders,
  currentFolderId,
}: MoveToFolderDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const router = useRouter();

  const handleMove = async () => {
    setIsMoving(true);
    try {
      await moveFileToFolder(fileId, selectedFolderId);
      toast.success("הקובץ הועבר בהצלחה");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsMoving(false);
    }
  };

  const availableOptions = [
    ...(currentFolderId !== null
      ? [{ id: null as number | null, name: "שורש הספרייה", isRoot: true }]
      : []),
    ...folders
      .filter((f) => f.id !== currentFolderId)
      .map((f) => ({ id: f.id as number | null, name: f.name, isRoot: false })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] text-right">
        <DialogHeader>
          <DialogTitle>העבר לתיקייה</DialogTitle>
          <DialogDescription>
            בחר תיקייה עבור &quot;{fileName}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 max-h-[300px] overflow-y-auto py-2" role="radiogroup" aria-label="בחר תיקיית יעד">
          {availableOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              אין תיקיות זמינות
            </p>
          ) : (
            availableOptions.map((option) => (
              <button
                key={option.id ?? "root"}
                type="button"
                role="radio"
                aria-checked={selectedFolderId === option.id}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-right transition-colors",
                  selectedFolderId === option.id
                    ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                    : "hover:bg-muted",
                )}
                onClick={() => setSelectedFolderId(option.id)}
              >
                {option.isRoot ? (
                  <Home className="w-4 h-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Folder className="w-4 h-4 text-[#4f95ff] shrink-0" fill="currentColor" />
                )}
                <span className="truncate">{option.name}</span>
              </button>
            ))
          )}
        </div>

        <DialogFooter className="mr-auto flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button
            onClick={handleMove}
            disabled={isMoving || availableOptions.length === 0}
            className="bg-[#4f95ff] hover:bg-[#4f95ff]/90"
          >
            {isMoving ? "מעביר..." : "העבר"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
