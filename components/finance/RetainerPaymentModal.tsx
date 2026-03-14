"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  CalendarClock,
} from "lucide-react";
import { markRetainerAsPaid } from "@/app/actions/finance-retainer";
import { toast } from "sonner";

interface RetainerPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  retainer: any;
  overdueCount: number;
}

export default function RetainerPaymentModal({
  isOpen,
  onClose,
  retainer,
  overdueCount,
}: RetainerPaymentModalProps) {
  const [selectedCount, setSelectedCount] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Reset to overdue count when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedCount(overdueCount > 0 ? overdueCount : 1);
    }
  }, [isOpen, overdueCount]);

  if (!retainer) return null;

  const totalAmount = Number(retainer.amount) * selectedCount;

  // Calculate date range covered based on selected count
  const startDate = new Date(retainer.nextDueDate);
  const endDate = new Date(startDate);
  // Iterate to find end date
  for (let i = 0; i < selectedCount; i++) {
    switch (retainer.frequency) {
      case "monthly":
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case "quarterly":
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case "annually":
      case "yearly":
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }
  }
  // The 'endDate' is the *next* due date after payment. So the paid period ends just before it.
  // Actually, let's just show "Pays up to [Date]"

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      // Dynamic import handled by server action call usually, but here we imported directly.
      // Note: createRetainerPayment is a server action
      await markRetainerAsPaid(retainer.id, selectedCount);

      toast.success(`התשלום נקלט בהצלחה - נרשמו ${selectedCount} תשלומים בסך כולל של ₪${totalAmount.toLocaleString()}`);

      onClose();
    } catch (error) {
      console.error(error);
      toast.error("אירעה שגיאה בעדכון התשלומים");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-2">
            <CreditCard className="w-6 h-6 text-[#4f95ff]" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            אישור תשלום ריטיינר
          </DialogTitle>
          <DialogDescription className="text-center text-gray-500">
            {overdueCount > 0
              ? `קיימים ${overdueCount} תשלומים פתוחים עבור לקוח זה.`
              : "אישור תשלום תקופתי עבור הריטיינר."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-8">
          {/* Amount Selection */}
          <div className="space-y-4 px-2">
            <div className="flex justify-between items-center text-sm font-medium">
              <Label className="text-gray-700">כמות תשלומים לכיסוי:</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setSelectedCount(Math.max(1, selectedCount - 1))
                  }
                  aria-label="הפחת תשלום"
                >
                  -
                </Button>
                <span className="text-[#4f95ff] font-bold text-lg w-8 text-center" aria-live="polite" aria-atomic="true">
                  {selectedCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSelectedCount(selectedCount + 1)}
                  aria-label="הוסף תשלום"
                >
                  +
                </Button>
              </div>
            </div>
            {/* Helper text */}
            <p className="text-xs text-gray-500">
              {selectedCount > overdueCount && overdueCount > 0
                ? `שים לב: אתה משלם ${
                    selectedCount - overdueCount
                  } תשלומים עתידיים.`
                : ""}
            </p>
          </div>

          {/* Summary Box */}
          <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100 space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
              <span className="text-gray-500 text-sm">סכום לתשלום בודד</span>
              <span className="font-medium text-gray-900">
                ₪{Number(retainer.amount).toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
              <span className="text-gray-500 text-sm flex items-center gap-2">
                <CalendarClock className="w-4 h-4" />
                תאריך הבא לאחר תשלום
              </span>
              <span className="font-medium text-[#4f95ff]">
                {endDate.toLocaleDateString("he-IL")}
              </span>
            </div>

            <div className="flex justify-between items-center pt-1">
              <span className="text-gray-900 font-bold">סה"כ לתשלום כעת</span>
              <span className="font-bold text-xl text-gray-900">
                ₪{totalAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto text-gray-500"
          >
            ביטול
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="w-full sm:w-auto bg-[#4f95ff] hover:bg-blue-600 text-white font-bold px-8 shadow-lg shadow-blue-500/20"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">מעדכן...</span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                אשר תשלום
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
