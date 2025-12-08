"use client";

import React, { useState } from "react";
import { Task } from "./TaskKanbanBoard";
import AlertDialog from "./AlertDialog";

interface TaskCardProps {
  task: Task;
  onDelete: (id: string) => void;
  onEdit: () => void;
}

export default function TaskCard({ task, onDelete, onEdit }: TaskCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("taskId", task.id);
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "high":
        return "text-red-400 bg-red-500/20";
      case "medium":
        return "text-yellow-400 bg-yellow-500/20";
      case "low":
        return "text-green-400 bg-green-500/20";
      default:
        return "text-slate-400 bg-slate-500/20";
    }
  };

  const formatDate = (dateValue?: string | Date) => {
    if (!dateValue) return null;
    const date =
      typeof dateValue === "string" ? new Date(dateValue) : dateValue;
    return date.toLocaleDateString("he-IL", { month: "short", day: "numeric" });
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-lg p-4 shadow-lg hover:shadow-xl transition-all cursor-move relative ${
        isDragging ? "opacity-50 scale-95" : "hover:scale-[1.02]"
      }`}
    >
      {/* Delete confirmation dialog */}
      <AlertDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          onDelete(task.id);
          setConfirmOpen(false);
        }}
        title="אישור מחיקה"
        description={`האם אתה בטוח שברצונך למחוק משימה "${task.title}"?`}
        confirmText="מחיקה"
        cancelText="ביטול"
        isDestructive={true}
      />

      {/* Actions */}
      <div className="absolute top-2 end-2 flex gap-1">
        <button
          onClick={onEdit}
          className="text-slate-400 hover:text-blue-400 p-1 rounded transition-colors"
          title="עריכת משימה"
        >
          ✎
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          className="text-slate-400 hover:text-red-400 p-1 rounded transition-colors"
          title="מחיקת משימה"
        >
          🗑️
        </button>
      </div>

      {/* Header */}
      <h4 className="text-white font-semibold text-sm mb-2">{task.title}</h4>

      {/* Description */}
      {task.description && (
        <p className="text-slate-400 text-xs mb-2 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {task.tags.map((tag, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-full"
            >
              🏷️ {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
        <div className="flex items-center gap-2">
          {/* Priority */}
          {task.priority && (
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${getPriorityColor(
                task.priority
              )}`}
            >
              ★{" "}
              {task.priority === "high"
                ? "גבוה"
                : task.priority === "medium"
                ? "בינוני"
                : "נמוך"}
            </span>
          )}

          {/* Due Date */}
          {task.dueDate && (
            <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
              📅 {formatDate(task.dueDate)}
            </span>
          )}
        </div>

        {/* Assignee */}
        {task.assignee && (
          <div className="flex items-center gap-1.5 bg-slate-700/50 px-2 py-1 rounded-full">
            👤{" "}
            <span className="text-xs text-slate-300">{task.assignee.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
