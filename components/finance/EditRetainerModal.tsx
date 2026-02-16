"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Trash2, Save } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

interface EditRetainerModalProps {
  retainer: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditRetainerModal({
  retainer,
  isOpen,
  onClose,
}: EditRetainerModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    frequency: "monthly",
    status: "active",
    nextDueDate: "",
    notes: "",
  });

  useEffect(() => {
    if (retainer) {
      setFormData({
        title: retainer.title,
        amount: retainer.amount,
        frequency: retainer.frequency,
        status: retainer.status,
        nextDueDate: retainer.nextDueDate
          ? new Date(retainer.nextDueDate).toISOString().split("T")[0]
          : "",
        notes: retainer.notes || "",
      });
    }
  }, [retainer]);

  if (!isOpen || !retainer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/finance/retainers/${retainer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Failed to update retainer");

      router.refresh();
      onClose();
    } catch (err) {
      setError("שגיאה בעדכון הריטיינר");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm("האם אתה בטוח שברצונך למחוק ריטיינר זה? לא ניתן לבטל פעולה זו.")
    )
      return;

    setIsLoading(true);
    try {
      const response = await apiFetch(`/api/finance/retainers/${retainer.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete retainer");

      router.refresh();
      onClose();
    } catch (err) {
      setError("שגיאה במחיקת הריטיינר");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">עריכת ריטיינר</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              כותרת
            </label>
            <input
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                סכום (₪)
              </label>
              <input
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                תדירות
              </label>
              <select
                value={formData.frequency}
                onChange={(e) =>
                  setFormData({ ...formData, frequency: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              >
                <option value="monthly">חודשי</option>
                <option value="quarterly">רבעוני</option>
                <option value="annually">שנתי</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                סטטוס
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              >
                <option value="active">פעיל</option>
                <option value="paused">מושהה</option>
                <option value="cancelled">בוטל</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                תזמון תשלום
              </label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setFormData({
                      ...formData,
                      nextDueDate: today.toISOString().split("T")[0],
                    });
                  }}
                  className="flex-1 py-2 px-3 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  התחל מיידית (היום)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    const freq = formData.frequency;
                    switch (freq) {
                      case "monthly":
                        today.setMonth(today.getMonth() + 1);
                        break;
                      case "quarterly":
                        today.setMonth(today.getMonth() + 3);
                        break;
                      case "annually":
                        today.setFullYear(today.getFullYear() + 1);
                        break;
                    }
                    setFormData({
                      ...formData,
                      nextDueDate: today.toISOString().split("T")[0],
                    });
                  }}
                  className="flex-1 py-2 px-3 text-xs bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  התחל מחזור הבא
                </button>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-1">
                תשלום הבא
              </label>
              <input
                type="date"
                value={formData.nextDueDate}
                onChange={(e) =>
                  setFormData({ ...formData, nextDueDate: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
              <p className="mt-1 text-xs text-gray-500">
                החישוב מתבצע החל מתאריך זה.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              הערות
            </label>
            <textarea
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
              className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"
            >
              <Trash2 className="w-4 h-4" />
              מחק
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-[#4f95ff] rounded-lg hover:bg-blue-600 flex items-center gap-2"
              >
                {isLoading ? (
                  "שומר..."
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    שמור שינויים
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
