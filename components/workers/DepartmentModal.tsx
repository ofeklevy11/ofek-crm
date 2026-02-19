"use client";

import { useState } from "react";
import { X, Building2, Palette, FileText, User } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { createDepartment, updateDepartment } from "@/app/actions/workers";

interface Department {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  managerId: number | null;
  isActive: boolean;
}

interface SystemUser {
  id: number;
  name: string;
  email: string;
}

interface Props {
  department: Department | null;
  users: SystemUser[];
  onClose: () => void;
  onSave: (department: any) => void;
}

const colorOptions = [
  { value: "#6366F1", label: "אינדיגו" },
  { value: "#8B5CF6", label: "סגול" },
  { value: "#EC4899", label: "ורוד" },
  { value: "#EF4444", label: "אדום" },
  { value: "#F97316", label: "כתום" },
  { value: "#EAB308", label: "צהוב" },
  { value: "#22C55E", label: "ירוק" },
  { value: "#14B8A6", label: "טורקיז" },
  { value: "#3B82F6", label: "כחול" },
  { value: "#64748B", label: "אפור" },
];

export default function DepartmentModal({
  department,
  users,
  onClose,
  onSave,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: department?.name ?? "",
    description: department?.description ?? "",
    color: department?.color ?? "#6366F1",
    managerId: department?.managerId ?? null,
    isActive: department?.isActive ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("יש להזין שם למחלקה");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        color: formData.color,
        managerId: formData.managerId || undefined,
        isActive: formData.isActive,
      };

      let result;
      if (department) {
        result = await updateDepartment(department.id, data);
      } else {
        result = await createDepartment(data);
      }

      onSave(result);
    } catch (error) {
      console.error("Error saving department:", error);
      alert("שגיאה בשמירת המחלקה");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {department ? "עריכת מחלקה" : "מחלקה חדשה"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {department ? "עדכן את פרטי המחלקה" : "הוסף מחלקה חדשה לארגון"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Building2 className="h-4 w-4 inline ml-1" />
              שם המחלקה *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              placeholder='למשל: "מכירות", "שיווק", "פיתוח"'
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="h-4 w-4 inline ml-1" />
              תיאור
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
              rows={3}
              placeholder="תאר את תפקיד המחלקה..."
            />
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Palette className="h-4 w-4 inline ml-1" />
              צבע המחלקה
            </label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, color: color.value })
                  }
                  className={`w-9 h-9 rounded-lg border-2 transition-all ${
                    formData.color === color.value
                      ? "border-gray-900 scale-110 shadow-md"
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Manager */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <User className="h-4 w-4 inline ml-1" />
              מנהל מחלקה
            </label>
            <select
              value={formData.managerId ?? ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  managerId: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            >
              <option value="">לא מוגדר</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          {/* Active Toggle */}
          {department && (
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label
                htmlFor="isActive"
                className="text-sm font-medium text-gray-700"
              >
                מחלקה פעילה
              </label>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition font-medium"
          >
            ביטול
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting
              ? <><Spinner size="sm" /> שומר...</>
              : department
              ? "שמור שינויים"
              : "צור מחלקה"}
          </button>
        </div>
      </div>
    </div>
  );
}
