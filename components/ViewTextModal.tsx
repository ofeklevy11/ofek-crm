"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Edit2 } from "lucide-react";

interface ViewTextModalProps {
  title: string;
  text: string;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
}

export default function ViewTextModal({
  title,
  text,
  isOpen,
  onClose,
  onEdit,
}: ViewTextModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full h-[80vh] flex flex-col p-0">
        <div className="p-6 border-b">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="p-6 overflow-y-auto flex-1 whitespace-pre-wrap wrap-break-word text-foreground text-sm leading-relaxed">
          {text}
        </div>

        <DialogFooter className="p-4 border-t gap-2 sm:justify-start">
          {onEdit && (
            <Button
              onClick={() => {
                onEdit();
                onClose();
              }}
              className="gap-2"
            >
              <Edit2 className="h-4 w-4" /> ערוך רשומה
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
