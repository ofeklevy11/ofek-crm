"use client";

import { useState } from "react";
import { createAutomationRule } from "@/app/actions/automations";
import { X } from "lucide-react";

interface User {
  id: number;
  name: string;
}

interface AutomationModalProps {
  users: User[];
  currentUserId: number;
  onClose: () => void;
  onCreated: () => void;
}

export default function AutomationModal({
  users,
  currentUserId,
  onClose,
  onCreated,
}: AutomationModalProps) {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<
    "TASK_STATUS_CHANGE" | "MANUAL"
  >("TASK_STATUS_CHANGE");
  const [toStatus, setToStatus] = useState("any");
  const [recipientId, setRecipientId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(
    "המשימה {taskTitle} עברה לסטטוס {toStatus}"
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const triggerConfig =
        triggerType === "TASK_STATUS_CHANGE"
          ? { toStatus: toStatus === "any" ? undefined : toStatus }
          : {};

      const result = await createAutomationRule({
        name,
        triggerType,
        triggerConfig,
        actionType: "SEND_NOTIFICATION",
        actionConfig: {
          recipientId: parseInt(recipientId),
          messageTemplate,
          titleTemplate: "עדכון משימה",
        },
        createdBy: currentUserId,
      });

      if (result.success) {
        onCreated();
        onClose();
      } else {
        alert("Failed to create automation");
      }
    } catch (error) {
      console.error(error);
      alert("Error creating automation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">
            צור אוטומציה חדשה
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              שם האוטומציה
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="לדוגמה: התראה על סיום משימה"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              טריגר (מה גורם להפעלה)
            </label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="TASK_STATUS_CHANGE">שינוי סטטוס משימה</option>
              {/* <option value="MANUAL">ידני</option> Future use */}
            </select>
          </div>

          {triggerType === "TASK_STATUS_CHANGE" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                כאשר הסטטוס משתנה ל-
              </label>
              <select
                value={toStatus}
                onChange={(e) => setToStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="any">כל סטטוס</option>
                <option value="todo">לביצוע</option>
                <option value="in_progress">בטיפול</option>
                <option value="waiting_client">ממתין ללקוח</option>
                <option value="completed_month">בוצע</option>
              </select>
            </div>
          )}

          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              פעולה: שליחת התראה
            </h4>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                למי לשלוח?
              </label>
              <select
                required
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">בחר משתמש...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                תוכן ההודעה
              </label>
              <textarea
                required
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                משתנים זמינים: {"{taskTitle}"}, {"{fromStatus}"}, {"{toStatus}"}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? "יוצר..." : "צור אוטומציה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
