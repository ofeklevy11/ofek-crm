"use client";

import { useState } from "react";
import {
  Building2,
  Users,
  GraduationCap,
  MoreVertical,
  Edit2,
  Trash2,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import { deleteDepartment } from "@/app/actions/workers";

interface Department {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  managerId: number | null;
  isActive: boolean;
  _count?: { workers: number; onboardingPaths: number };
}

interface Props {
  departments: Department[];
  onEdit: (department: Department) => void;
  onDelete: (id: number) => void;
}

export default function DepartmentsList({
  departments,
  onEdit,
  onDelete,
}: Props) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  const handleDelete = async (department: Department) => {
    if (department._count && department._count.workers > 0) {
      alert(
        "לא ניתן למחוק מחלקה עם עובדים פעילים. יש להעביר אותם למחלקה אחרת קודם."
      );
      return;
    }

    if (!confirm(`האם אתה בטוח שברצונך למחוק את המחלקה "${department.name}"?`))
      return;

    setDeletingId(department.id);
    try {
      await deleteDepartment(department.id);
      onDelete(department.id);
    } catch (error: any) {
      console.error("Error deleting department:", error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setDeletingId(null);
    }
  };

  if (departments.length === 0) {
    return (
      <div className="text-center py-16">
        <Building2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-700 mb-2">אין מחלקות</h3>
        <p className="text-gray-500">
          לחץ על &apos;מחלקה חדשה&apos; להוספת המחלקה הראשונה
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
      {departments.map((department) => (
        <div
          key={department.id}
          className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden"
        >
          {/* Color Header */}
          <div
            className="h-2"
            style={{ backgroundColor: department.color ?? "#6366F1" }}
          />

          <div className="p-5">
            {/* Title & Actions */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className="p-2.5 rounded-lg"
                  style={{
                    backgroundColor: `${department.color ?? "#6366F1"}20`,
                    color: department.color ?? "#6366F1",
                  }}
                >
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {department.name}
                  </h3>
                  {!department.isActive && (
                    <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                      לא פעיל
                    </span>
                  )}
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() =>
                    setMenuOpenId(
                      menuOpenId === department.id ? null : department.id
                    )
                  }
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpenId === department.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpenId(null)}
                    />
                    <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-50 min-w-[120px]">
                      <button
                        onClick={() => {
                          setMenuOpenId(null);
                          onEdit(department);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Edit2 className="h-4 w-4" />
                        עריכה
                      </button>
                      <button
                        onClick={() => {
                          setMenuOpenId(null);
                          handleDelete(department);
                        }}
                        disabled={deletingId === department.id}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === department.id ? "מוחק..." : "מחיקה"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            {department.description && (
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {department.description}
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <Users className="h-4 w-4 text-gray-400" />
                <span>{department._count?.workers ?? 0} עובדים</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <GraduationCap className="h-4 w-4 text-gray-400" />
                <span>{department._count?.onboardingPaths ?? 0} מסלולים</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
