"use client";

import React from "react";
import TaskCard from "./TaskCard";
import { Plus } from "lucide-react";
import { Task, TaskStatus } from "./TaskKanbanBoard";

interface KanbanColumnProps {
  title: string;
  color: string;
  tasks: Task[];
  status: TaskStatus;
  onTaskMove: (taskId: string, newStatus: TaskStatus) => void;
  onTaskCreate: () => void;
  onTaskDelete: (taskId: string) => void;
  onTaskEdit: (task: Task) => void;
  canCreate?: boolean;
}

export default function KanbanColumn({
  title,
  color,
  tasks,
  status,
  onTaskMove,
  onTaskCreate,
  onTaskDelete,
  onTaskEdit,
  canCreate = false,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      onTaskMove(taskId, status);
    }
  };

  return (
    <div
      className={`flex flex-col h-full min-h-[600px] rounded-xl overflow-hidden transition-all ${
        isDragOver ? "ring-2 ring-blue-500 scale-105" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className={`bg-linear-to-r ${color} p-4 shadow-lg`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-bold text-lg">{title}</h3>
          {canCreate && (
            <button
              onClick={onTaskCreate}
              className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-all hover:scale-110"
              title="הוסף משימה"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-white/20 text-white text-sm px-3 py-1 rounded-full font-medium">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Column Content */}
      <div className="flex-1 bg-slate-800/30 backdrop-blur-sm p-3 space-y-3 overflow-y-auto border-x border-b border-slate-700/50">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12">
            <p className="text-center">אין משימות</p>
            {canCreate && (
              <button
                onClick={onTaskCreate}
                className="mt-4 text-blue-400 hover:text-blue-300 text-sm underline"
              >
                הוסף משימה ראשונה
              </button>
            )}
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onDelete={() => onTaskDelete(task.id)}
              onEdit={() => onTaskEdit(task)}
            />
          ))
        )}
      </div>
    </div>
  );
}
