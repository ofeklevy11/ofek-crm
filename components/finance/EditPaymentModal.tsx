"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Save } from "lucide-react";
import { apiFetch, throwResponseError } from "@/lib/api-fetch";
import { showConfirm } from "@/hooks/use-modal";
import { getUserFriendlyError } from "@/lib/errors";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EditPaymentModalProps {
  payment: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditPaymentModal({
  payment,
  isOpen,
  onClose,
}: EditPaymentModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    dueDate: "",
    status: "pending",
    notes: "",
  });

  useEffect(() => {
    if (payment) {
      setFormData({
        title: payment.title,
        amount: payment.amount,
        dueDate: payment.dueDate
          ? new Date(payment.dueDate).toISOString().split("T")[0]
          : "",
        status: payment.status,
        notes: payment.notes || "",
      });
    }
  }, [payment]);

  if (!payment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/finance/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) await throwResponseError(response, "Failed to update payment");

      toast.success("התשלום עודכן בהצלחה");
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(getUserFriendlyError(err));
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!(await showConfirm({ message: "האם אתה בטוח שברצונך למחוק תשלום זה? לא ניתן לבטל פעולה זו.", variant: "destructive" })))
      return;

    setIsLoading(true);
    try {
      const response = await apiFetch(`/api/finance/payments/${payment.id}`, {
        method: "DELETE",
      });

      if (!response.ok) await throwResponseError(response, "Failed to delete payment");

      toast.success("התשלום נמחק בהצלחה");
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(getUserFriendlyError(err));
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>עריכת תשלום</DialogTitle>
          <DialogDescription className="sr-only">טופס עריכת פרטי תשלום</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="payment-title" className="block text-sm font-medium text-gray-700 mb-1">
              כותרת
            </label>
            <input
              id="payment-title"
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="payment-amount" className="block text-sm font-medium text-gray-700 mb-1">
                סכום (₪)
              </label>
              <input
                id="payment-amount"
                type="number"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                required
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label htmlFor="payment-due-date" className="block text-sm font-medium text-gray-700 mb-1">
                תאריך יעד
              </label>
              <input
                id="payment-due-date"
                type="date"
                value={formData.dueDate}
                onChange={(e) =>
                  setFormData({ ...formData, dueDate: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="payment-status" className="block text-sm font-medium text-gray-700 mb-1">
              סטטוס
            </label>
            <select
              id="payment-status"
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            >
              <option value="pending">ממתין</option>
              <option value="paid">שולם</option>
              <option value="overdue">באיחור</option>
              <option value="cancelled">בוטל</option>
            </select>
          </div>

          <div>
            <label htmlFor="payment-notes" className="block text-sm font-medium text-gray-700 mb-1">
              הערות
            </label>
            <textarea
              id="payment-notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
              className="w-full rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-4">
            <button
              type="button"
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 rounded"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              מחק
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-[#4f95ff] focus-visible:ring-offset-2"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-[#4f95ff] rounded-lg hover:bg-blue-600 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[#4f95ff] focus-visible:ring-offset-2"
              >
                {isLoading ? (
                  "שומר..."
                ) : (
                  <>
                    <Save className="w-4 h-4" aria-hidden="true" />
                    שמור שינויים
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
