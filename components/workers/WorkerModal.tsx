"use client";

import { useState, useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  X,
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Calendar,
  Hash,
  FileText,
  Link as LinkIcon,
  GraduationCap,
} from "lucide-react";
import {
  createWorker,
  updateWorker,
  assignOnboardingPath,
} from "@/app/actions/workers";

interface Worker {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  position: string | null;
  employeeId: string | null;
  status: string;
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  departmentId: number;
  linkedUserId?: number | null;
}

interface Department {
  id: number;
  name: string;
  color: string | null;
}

interface OnboardingPath {
  id: number;
  name: string;
  departmentId: number | null;
  isDefault: boolean;
  isActive: boolean;
}

interface SystemUser {
  id: number;
  name: string;
  email: string;
}

interface Props {
  worker: Worker | null;
  departments: Department[];
  users: SystemUser[];
  onboardingPaths?: OnboardingPath[];
  onClose: () => void;
  onSave: (worker: any) => void;
}

export default function WorkerModal({
  worker,
  departments,
  users,
  onboardingPaths = [],
  onClose,
  onSave,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: worker?.firstName ?? "",
    lastName: worker?.lastName ?? "",
    email: worker?.email ?? "",
    phone: worker?.phone ?? "",
    departmentId: worker?.departmentId ?? departments[0]?.id ?? 0,
    position: worker?.position ?? "",
    employeeId: worker?.employeeId ?? "",
    startDate: worker?.startDate
      ? new Date(worker.startDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    notes: worker?.notes ?? "",
    linkedUserId: worker?.linkedUserId ?? null,
    status: worker?.status ?? "ONBOARDING",
    onboardingPathId: null as number | null,
  });

  // Get available onboarding paths for the selected department
  const availablePaths = onboardingPaths.filter(
    (path) =>
      path.isActive &&
      (path.departmentId === null ||
        path.departmentId === formData.departmentId)
  );

  // Auto-select default path when department changes
  useEffect(() => {
    if (!worker) {
      const defaultPath = availablePaths.find(
        (p) =>
          p.isDefault &&
          (p.departmentId === formData.departmentId || p.departmentId === null)
      );
      if (defaultPath) {
        setFormData((prev) => ({ ...prev, onboardingPathId: defaultPath.id }));
      }
    }
  }, [formData.departmentId, availablePaths.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      alert("יש למלא שם פרטי ושם משפחה");
      return;
    }

    if (!formData.departmentId) {
      alert("יש לבחור מחלקה");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        departmentId: formData.departmentId,
        position: formData.position.trim() || undefined,
        employeeId: formData.employeeId.trim() || undefined,
        startDate: new Date(formData.startDate),
        notes: formData.notes.trim() || undefined,
        linkedUserId: formData.linkedUserId || undefined,
        status: formData.status,
      };

      let result;
      if (worker) {
        result = await updateWorker(worker.id, data);
      } else {
        result = await createWorker(data);

        // Assign onboarding path if selected
        if (formData.onboardingPathId && result.id) {
          await assignOnboardingPath(result.id, formData.onboardingPathId);
        }
      }

      onSave(result);
    } catch (error) {
      console.error("Error saving worker:", error);
      alert("שגיאה בשמירת העובד");
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusOptions = [
    { value: "ONBOARDING", label: "בקליטה" },
    { value: "ACTIVE", label: "פעיל" },
    { value: "ON_LEAVE", label: "בחופשה" },
    { value: "TERMINATED", label: "סיום עבודה" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {worker ? "עריכת עובד" : "עובד חדש"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {worker ? "עדכן את פרטי העובד" : "הוסף עובד חדש למערכת"}
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
        <form
          onSubmit={handleSubmit}
          className="p-6 overflow-y-auto max-h-[calc(90vh-160px)]"
        >
          <div className="space-y-6">
            {/* Personal Info */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-500" />
                פרטים אישיים
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    שם פרטי *
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    placeholder="הכנס שם פרטי"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    שם משפחה *
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    placeholder="הכנס שם משפחה"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Mail className="h-4 w-4 inline ml-1" />
                    אימייל
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone className="h-4 w-4 inline ml-1" />
                    טלפון
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    placeholder="050-0000000"
                  />
                </div>
              </div>
            </div>

            {/* Employment Info */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-indigo-500" />
                פרטי העסקה
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Building2 className="h-4 w-4 inline ml-1" />
                    מחלקה *
                  </label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        departmentId: Number(e.target.value),
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    required
                  >
                    <option value="">בחר מחלקה</option>
                    {departments.map((dep) => (
                      <option key={dep.id} value={dep.id}>
                        {dep.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    תפקיד
                  </label>
                  <input
                    type="text"
                    value={formData.position}
                    onChange={(e) =>
                      setFormData({ ...formData, position: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    placeholder='למשל: "מנהל מכירות"'
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Hash className="h-4 w-4 inline ml-1" />
                    מספר עובד
                  </label>
                  <input
                    type="text"
                    value={formData.employeeId}
                    onChange={(e) =>
                      setFormData({ ...formData, employeeId: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    placeholder="מספר עובד פנימי"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="h-4 w-4 inline ml-1" />
                    תאריך התחלה
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>
                {worker && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      סטטוס
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({ ...formData, status: e.target.value })
                      }
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    >
                      {statusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <LinkIcon className="h-4 w-4 inline ml-1" />
                    קישור למשתמש מערכת
                  </label>
                  <select
                    value={formData.linkedUserId ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        linkedUserId: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  >
                    <option value="">לא מקושר</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Onboarding Path - Only for new workers */}
            {!worker && availablePaths.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-indigo-500" />
                  מסלול קליטה
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    בחר מסלול קליטה (אופציונלי)
                  </label>
                  <select
                    value={formData.onboardingPathId ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        onboardingPathId: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  >
                    <option value="">ללא מסלול קליטה</option>
                    {availablePaths.map((path) => (
                      <option key={path.id} value={path.id}>
                        {path.name} {path.isDefault ? "(ברירת מחדל)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    מסלול הקליטה יוקצה לעובד עם יצירתו
                  </p>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <FileText className="h-4 w-4 inline ml-1" />
                הערות
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
                rows={3}
                placeholder="הוסף הערות..."
              />
            </div>
          </div>
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
            {isSubmitting ? <><Spinner size="sm" /> שומר...</> : worker ? "שמור שינויים" : "הוסף עובד"}
          </button>
        </div>
      </div>
    </div>
  );
}
