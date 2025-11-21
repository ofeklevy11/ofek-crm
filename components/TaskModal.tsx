"use client";

import React, { useState } from "react";

interface TaskModalProps {
  // initial column status where the task will be created; user can change it
  status: string;
  onClose: () => void;
  onCreated: (task: any) => void; // callback to add the new task to the board state
}

export default function TaskModal({
  status,
  onClose,
  onCreated,
}: TaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // default due date to today (YYYY-MM-DD)
  const today = new Date().toISOString().split("T")[0];
  const [dueDate, setDueDate] = useState(today);
  // allow user to select status (default to passed prop)
  const [selectedStatus, setSelectedStatus] = useState(status);
  // priority selector, default low
  const [priority, setPriority] = useState<"high" | "medium" | "low">("low");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        dueDate,
        status: selectedStatus,
        priority,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    if (res.ok) {
      const newTask = await res.json();
      onCreated(newTask);
      onClose();
    } else {
      alert("הוספת משימה נכשלה");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 className="text-xl font-bold text-white mb-4">משימה חדשה</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            required
            placeholder="שם המשימה"
            className="w-full bg-slate-900/50 text-white rounded px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            placeholder="תיאור (אופציונלי)"
            className="w-full bg-slate-900/50 text-white rounded px-3 py-2"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            type="date"
            className="w-full bg-slate-900/50 text-white rounded px-3 py-2"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          {/* Status selector */}
          <select
            className="w-full bg-slate-900/50 text-white rounded px-3 py-2"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="todo">משימות</option>
            <option value="in_progress">משימות בטיפול</option>
            <option value="waiting_client">ממתינים לאישור לקוח</option>
            <option value="completed_month">בוצעו החודש</option>
          </select>
          {/* Priority selector */}
          <select
            className="w-full bg-slate-900/50 text-white rounded px-3 py-2"
            value={priority}
            onChange={(e) =>
              setPriority(e.target.value as "high" | "medium" | "low")
            }
          >
            <option value="high">גבוה</option>
            <option value="medium">בינוני</option>
            <option value="low">נמוך</option>
          </select>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition"
            >
              <span className="w-4 h-4" role="img" aria-label="plus">
                +
              </span>
              שמור
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
