"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface TaskModalProps {
  // initial column status where the task will be created; user can change it
  status: string;
  onClose: () => void;
  onCreated: (task: any) => void; // callback to add the new task to the board state
  onUpdated?: (task: any) => void; // callback to update the task in the board state
  task?: any; // task to edit
}

export default function TaskModal({
  status,
  onClose,
  onCreated,
  onUpdated,
  task,
}: TaskModalProps) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  // default due date to today (YYYY-MM-DD)
  const today = new Date().toISOString().split("T")[0];
  const [dueDate, setDueDate] = useState(() => {
    if (task?.dueDate) {
      return new Date(task.dueDate).toISOString().split("T")[0];
    }
    return today;
  });
  // allow user to select status (default to passed prop)
  const [selectedStatus, setSelectedStatus] = useState(task?.status || status);
  // priority selector, default low
  const [priority, setPriority] = useState<"high" | "medium" | "low">(
    task?.priority || "low",
  );
  const [assigneeId, setAssigneeId] = useState<number | undefined>(
    task?.assigneeId || task?.assignee?.id || undefined,
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(task?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<
    Array<{ id: number; name: string; email: string }>
  >([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { getUsers } = await import("@/app/actions/users");
        const result = await getUsers();
        if (result.success && result.data) {
          setUsers(result.data);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        toast.error(getUserFriendlyError(error));
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, []);

  const AVAILABLE_TAGS = [
    "עיצוב",
    "דחוף",
    "פיתוח",
    "backend",
    "QA",
    "בדיקות",
    "DevOps",
    "תחזוקה",
  ];

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (e.type === "keydown" && (e as React.KeyboardEvent).key !== "Enter")
      return;
    e.preventDefault();
    const tag = tagInput.trim();
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const taskData = {
      title,
      description,
      dueDate,
      status: selectedStatus,
      priority,
      assigneeId: assigneeId || undefined,
      tags: selectedTags,
    };

    setLoading(true);
    try {
      if (task) {
        // Update existing task
        const { updateTask } = await import("@/app/actions");
        const result = await updateTask(task.id, taskData);
        if (result.success) {
          toast.success("המשימה עודכנה בהצלחה");
          if (onUpdated) onUpdated(result.data);
          onClose();
        } else {
          toast.error("עדכון משימה נכשל");
        }
      } else {
        // Create new task
        const { createTask } = await import("@/app/actions");
        const result = await createTask(taskData);
        if (result.success) {
          toast.success("המשימה נוצרה בהצלחה");
          onCreated(result.data);
          onClose();
        } else {
          toast.error("הוספת משימה נכשלה");
        }
      }
    } catch (error) {
      console.error("Error saving task:", error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-white mb-4">
          {task ? "עריכת משימה" : "משימה חדשה"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-1">כותרת</label>
            <input
              required
              placeholder="שם המשימה"
              className="w-full bg-slate-900/50 text-white rounded px-3 py-2 border border-slate-700 focus:border-blue-500 outline-none"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1">תיאור</label>
            <textarea
              placeholder="תיאור (אופציונלי)"
              className="w-full bg-slate-900/50 text-white rounded px-3 py-2 border border-slate-700 focus:border-blue-500 outline-none"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1">
                תאריך יעד
              </label>
              <input
                type="date"
                className="w-full bg-slate-900/50 text-white rounded px-3 py-2 border border-slate-700 focus:border-blue-500 outline-none"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">סטטוס</label>
              <div className="relative">
                <select
                  className="w-full bg-slate-900/50 text-white rounded pr-3 pl-10 py-2 border border-slate-700 focus:border-blue-500 outline-none appearance-none"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="todo">משימות</option>
                  <option value="in_progress">משימות בטיפול</option>
                  <option value="waiting_client">ממתינים לאישור לקוח</option>
                  <option value="on_hold">משימות בהשהייה</option>
                  <option value="completed_month">בוצעו החודש</option>
                  <option value="done">משימות שבוצעו</option>
                </select>
                <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
              </div>
            </div>
          </div>

          {task && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1">
                  תאריך התחלה
                </label>
                <div className="w-full bg-slate-900/30 text-slate-300 rounded px-3 py-2 border border-slate-700/50 cursor-not-allowed">
                  {task.createdAt
                    ? new Date(task.createdAt).toLocaleDateString("he-IL")
                    : "-"}
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1">
                  נוצר על ידי
                </label>
                <div className="w-full bg-slate-900/30 text-slate-300 rounded px-3 py-2 border border-slate-700/50 cursor-not-allowed">
                  {task.creator?.name || "לא ידוע"}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1">
                עדיפות
              </label>
              <div className="relative">
                <select
                  className="w-full bg-slate-900/50 text-white rounded pr-3 pl-10 py-2 border border-slate-700 focus:border-blue-500 outline-none appearance-none"
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as "high" | "medium" | "low")
                  }
                >
                  <option value="high">גבוה</option>
                  <option value="medium">בינוני</option>
                  <option value="low">נמוך</option>
                </select>
                <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
              </div>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">אחראי</label>
              <div className="relative">
                <select
                  className="w-full bg-slate-900/50 text-white rounded pr-3 pl-10 py-2 border border-slate-700 focus:border-blue-500 outline-none appearance-none"
                  value={assigneeId || ""}
                  onChange={(e) =>
                    setAssigneeId(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  disabled={loadingUsers}
                >
                  <option value="">ללא אחראי</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">תגיות</label>
            <div className="flex gap-2 mb-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="הקלד תגית ולחץ Enter"
                className="flex-1 bg-slate-900/50 text-white rounded px-3 py-2 border border-slate-700 focus:border-blue-500 outline-none text-sm"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded transition-colors text-sm"
              >
                הוסף
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 bg-blue-600/20 text-blue-300 px-2 py-1 rounded-full text-xs border border-blue-500/30"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-white transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <span className="w-4 h-4 font-bold flex items-center justify-center" role="img" aria-label="plus">
                  {task ? "✎" : "+"}
                </span>
              )}
              {task ? "עדכן משימה" : "שמור משימה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
