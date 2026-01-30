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

      {/* Priority Badge - Above Title */}
      {task.priority && (
        <div className="mb-1">
          <span
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${getPriorityColor(
              task.priority,
            )}`}
          >
            ★{" "}
            {task.priority === "high"
              ? "גבוה"
              : task.priority === "medium"
                ? "בינוני"
                : "נמוך"}
          </span>
        </div>
      )}

      {/* Header */}
      {/* Header */}
      <h4
        className="text-white font-semibold text-sm mb-2 break-words line-clamp-2"
        title={task.title}
      >
        {task.title}
      </h4>

      {/* Dates Row - Below Title */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* Start Date */}
        <span className="inline-flex items-center gap-1.5 bg-purple-500/10 text-purple-200 text-xs px-2 py-0.5 rounded-full border border-purple-500/20">
          <span className="opacity-70">🚀 התחלנו:</span>
          <span className="font-medium">{formatDate(task.createdAt)}</span>
        </span>

        {/* Due Date */}
        {task.dueDate && (
          <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-200 text-xs px-2 py-0.5 rounded-full border border-emerald-500/20">
            <span className="opacity-70">📅 יעד לסיום:</span>
            <span className="font-medium">{formatDate(task.dueDate)}</span>
          </span>
        )}
      </div>

      {/* Description */}
      {task.description && (
        <DescriptionWithReadMore
          text={task.description}
          onReadMore={() => onEdit()}
        />
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
      {task.assignee && (
        <div className="flex items-center justify-end pt-2 border-t border-slate-700/50">
          <div className="flex items-center gap-1.5 bg-slate-700/50 px-2 py-1 rounded-full">
            👤{" "}
            <span className="text-xs text-slate-300">{task.assignee.name}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DescriptionWithReadMore({
  text,
  onReadMore,
}: {
  text: string;
  onReadMore: () => void;
}) {
  const [isTruncated, setIsTruncated] = React.useState(false);
  const textRef = React.useRef<HTMLParagraphElement>(null);

  React.useEffect(() => {
    if (textRef.current) {
      const { scrollHeight, clientHeight } = textRef.current;
      setIsTruncated(scrollHeight > clientHeight);
    }
  }, [text]);

  return (
    <div className="mb-2">
      <p
        ref={textRef}
        className="text-slate-400 text-xs line-clamp-3 mb-0.5 break-words break-all"
      >
        {text}
      </p>
      {isTruncated && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReadMore();
          }}
          className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline transition-colors block"
        >
          קרא עוד...
        </button>
      )}
    </div>
  );
}
