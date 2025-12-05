"use client";

import { useState } from "react";
import { toggleView, deleteView, ViewConfig } from "@/app/actions/views";
import { useRouter } from "next/navigation";
import EditViewModal from "./EditViewModal";

interface DynamicViewCardProps {
  viewId: number;
  viewName: string;
  viewSlug: string;
  title: string;
  isEnabled: boolean;
  config: ViewConfig;
  tableSlug: string;
  schema: Array<{
    name: string;
    type: string;
    label: string;
    options?: string[];
  }>;
  children: React.ReactNode;
  onDelete?: () => void;
}

export default function DynamicViewCard({
  viewId,
  viewName,
  viewSlug,
  title,
  isEnabled: initialIsEnabled,
  config,
  tableSlug,
  schema,
  children,
  onDelete,
}: DynamicViewCardProps) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(initialIsEnabled);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleToggle = async () => {
    setIsToggling(true);
    const result = await toggleView(viewId);

    if (result.success) {
      setIsEnabled(result.view!.isEnabled);
      router.refresh();
    } else {
      alert(`שגיאה בשינוי מצב התצוגה: ${result.error}`);
    }

    setIsToggling(false);
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `האם אתה בטוח שברצונך למחוק את התצוגה "${title}"? פעולה זו בלתי הפיכה.`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteView(viewId);

    if (result.success) {
      router.refresh();
      if (onDelete) onDelete();
    } else {
      alert(`שגיאה במחיקת התצוגה: ${result.error}`);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
              title="ערוך תצוגה"
            >
              ✏️
            </button>
            <button
              onClick={handleToggle}
              disabled={isToggling}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                isEnabled
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              } disabled:opacity-50`}
              title={isEnabled ? "הסתר" : "הצג"}
            >
              {isToggling ? "..." : isEnabled ? "ON" : "OFF"}
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-1 text-red-500 hover:bg-red-50 rounded transition disabled:opacity-50"
              title="מחק תצוגה"
            >
              {isDeleting ? "..." : "🗑️"}
            </button>
          </div>
        </div>
        {isEnabled && <div className="p-6">{children}</div>}
      </div>

      {showEditModal && (
        <EditViewModal
          viewId={viewId}
          currentConfig={{
            name: viewName,
            slug: viewSlug,
            config,
            isEnabled,
          }}
          tableSlug={tableSlug}
          schema={schema}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  );
}
