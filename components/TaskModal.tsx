"use client";

import React, { useState } from "react";

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
  const [dueDate, setDueDate] = useState(task?.dueDate || today);
  // allow user to select status (default to passed prop)
  const [selectedStatus, setSelectedStatus] = useState(task?.status || status);
  // priority selector, default low
  const [priority, setPriority] = useState<"high" | "medium" | "low">(
    task?.priority || "low"
  );
  const [assignee, setAssignee] = useState(task?.assignee || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(task?.tags || []);
  const [tagInput, setTagInput] = useState("");

  const AVAILABLE_ASSIGNEES = ["אופק", "דני", "שרה", "מיכאל"];
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
      assignee,
      tags: selectedTags,
    };

    try {
      if (task) {
        // Update existing task
        const { updateTask } = await import("@/app/actions");
        const result = await updateTask(task.id, taskData);
        if (result.success) {
          if (onUpdated) onUpdated(result.data);
          onClose();
        } else {
          alert("עדכון משימה נכשל");
        }
      } else {
        // Create new task
        const { createTask } = await import("@/app/actions");
        const result = await createTask(taskData);
        if (result.success) {
          onCreated(result.data);
          onClose();
        } else {
          alert("הוספת משימה נכשלה");
        }
      }
    } catch (error) {
      console.error("Error saving task:", error);
      alert("שגיאה בשמירת המשימה");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
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
              <select
                className="w-full bg-slate-900/50 text-white rounded px-3 py-2 border border-slate-700 focus:border-blue-500 outline-none"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="todo">משימות</option>
                <option value="in_progress">משימות בטיפול</option>
                <option value="waiting_client">ממתינים לאישור לקוח</option>
                <option value="completed_month">בוצעו החודש</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1">
                עדיפות
              </label>
              <select
                className="w-full bg-slate-900/50 text-white rounded px-3 py-2 border border-slate-700 focus:border-blue-500 outline-none"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as "high" | "medium" | "low")
                }
              >
                <option value="high">גבוה</option>
                <option value="medium">בינוני</option>
                <option value="low">נמוך</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">אחראי</label>
              <input
                placeholder="שם האחראי"
                className="w-full bg-slate-900/50 text-white rounded px-3 py-2 border border-slate-700 focus:border-blue-500 outline-none"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              />
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
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors shadow-lg shadow-blue-900/20"
            >
              <span className="w-4 h-4 font-bold" role="img" aria-label="plus">
                {task ? "✎" : "+"}
              </span>
              {task ? "עדכן משימה" : "שמור משימה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
