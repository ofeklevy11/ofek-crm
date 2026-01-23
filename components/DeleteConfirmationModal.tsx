"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  widgetTitle: string;
}

export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  widgetTitle,
}: DeleteConfirmationModalProps) {
  const [inputValue, setInputValue] = useState("");

  const handleConfirm = () => {
    if (inputValue === widgetTitle) {
      onConfirm();
      setInputValue("");
    }
  };

  const handleClose = () => {
    setInputValue("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 size={20} />
            מחיקת וידג׳ט
          </DialogTitle>
          <DialogDescription className="pt-2">
            פעולה זו תמחק את הווידג׳ט מהדאשבורד לצמיתות.
            <br />
            כדי לאשר את המחיקה, אנא הקלד את שם הווידג׳ט:
            <span className="block font-bold text-gray-900 mt-1 select-all">
              {widgetTitle}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`הקלד "${widgetTitle}" לאישור`}
            className="w-full"
            autoFocus
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={inputValue !== widgetTitle}
            className="flex-1 sm:flex-none"
          >
            מחק
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            className="flex-1 sm:flex-none"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
