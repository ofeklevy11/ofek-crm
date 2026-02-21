"use client";

import { useState, useEffect } from "react";
import { createProduct, updateProduct } from "@/app/actions/products";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface Product {
  id: number;
  name: string;
  description: string | null;
  sku: string | null;
  type: string;
  price: any;
  cost: any | null;
  isActive: boolean;
}

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
}

export function ProductModal({
  isOpen,
  onClose,
  productToEdit,
}: ProductModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [descriptionPopupOpen, setDescriptionPopupOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    sku: "",
    type: "SERVICE",
    price: "",
    cost: "",
  });

  useEffect(() => {
    if (productToEdit) {
      setFormData({
        name: productToEdit.name,
        description: productToEdit.description || "",
        sku: productToEdit.sku || "",
        type: productToEdit.type,
        price: productToEdit.price.toString(),
        cost: productToEdit.cost?.toString() || "",
      });
    } else {
      setFormData({
        name: "",
        description: "",
        sku: "",
        type: "SERVICE",
        price: "",
        cost: "",
      });
    }
  }, [productToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        sku: formData.sku || undefined,
        type: formData.type,
        price: parseFloat(formData.price) || 0,
        cost: parseFloat(formData.cost) || 0,
      };

      if (productToEdit) {
        await updateProduct(productToEdit.id, payload);
      } else {
        await createProduct(payload);
      }

      router.refresh();
      onClose();
    } catch (error: any) {
      console.error(error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {productToEdit ? "עריכת שירות / מוצר" : "הוספת שירות / מוצר חדש"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">הגדר את פרטי ההיצע שלך</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
          >
            <span className="sr-only">סגור</span>
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                שם הפריט
              </label>
              <input
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none transition-all bg-white"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="לדוגמה: בדיקת SEO"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                סוג
              </label>
              <select
                className="w-full appearance-none pr-4 pl-10 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none transition-all"
                style={{
                  backgroundColor: "white",
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "left 12px center",
                  backgroundSize: "12px",
                }}
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value })
                }
              >
                <option value="SERVICE">שירות</option>
                <option value="PRODUCT">מוצר</option>
                <option value="PACKAGE">חבילה</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              מק״ט (אופציונלי)
            </label>
            <input
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none transition-all bg-white"
              value={formData.sku}
              onChange={(e) =>
                setFormData({ ...formData, sku: e.target.value })
              }
              placeholder="לדוגמה: SKU-001"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              תיאור
            </label>
            <button
              type="button"
              onClick={() => setDescriptionPopupOpen(true)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl hover:border-[#4f95ff] outline-none transition-all bg-white text-right flex items-center justify-between gap-2"
            >
              <span className={`truncate ${formData.description ? "text-gray-900" : "text-gray-400"}`}>
                {formData.description || "לחץ להוספת תיאור..."}
              </span>
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>

          {descriptionPopupOpen && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" dir="rtl">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh]">
                <div className="flex justify-between items-center p-5 border-b border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900">תיאור המוצר / שירות</h3>
                  <button
                    type="button"
                    onClick={() => setDescriptionPopupOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-5">
                  <textarea
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none transition-all bg-white resize-none"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="כתוב תיאור מפורט למוצר או לשירות..."
                    rows={22}
                    autoFocus
                  />
                </div>
                <div className="flex justify-start gap-3 p-5 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setDescriptionPopupOpen(false)}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-[#4f95ff] rounded-xl hover:bg-[#3b82f6] transition-all shadow-lg hover:shadow-xl"
                  >
                    שמור
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescriptionPopupOpen(false)}
                    className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    סגור
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                מחיר (הכנסה)
              </label>
              <div className="relative">
                <span className="absolute right-4 top-2.5 text-gray-500">
                  ₪
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none transition-all bg-white"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                עלות (הוצאה)
              </label>
              <div className="relative">
                <span className="absolute right-4 top-2.5 text-gray-500">
                  ₪
                </span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none transition-all bg-white"
                  value={formData.cost}
                  onChange={(e) =>
                    setFormData({ ...formData, cost: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <div className="bg-[#f4f8f8] p-4 rounded-xl text-sm flex justify-between items-center border border-gray-100">
            <span className="text-gray-600 font-medium">רווח משוער:</span>
            <div className="font-semibold">
              {(() => {
                const p = parseFloat(formData.price) || 0;
                const c = parseFloat(formData.cost) || 0;
                const margin = p - c;
                const percent = p > 0 ? ((margin / p) * 100).toFixed(1) : 0;
                return (
                  <span
                    className={
                      margin >= 0 ? "text-emerald-600" : "text-rose-600"
                    }
                  >
                    ₪{margin.toFixed(2)} ({percent}%)
                  </span>
                );
              })()}
            </div>
          </div>

          <div className="flex justify-start gap-3 pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 text-sm font-medium text-white bg-[#4f95ff] rounded-xl hover:bg-[#3b82f6] disabled:opacity-50 transition-all shadow-lg hover:shadow-xl"
            >
              {loading ? "שומר..." : productToEdit ? "שמור שינויים" : "צור חדש"}
            </button>
            <button
              type="button"
              className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              onClick={onClose}
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
