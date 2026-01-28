"use client";

import React, { useState, useEffect } from "react";
import KanbanColumn from "./KanbanColumn";
import TaskModal from "./TaskModal";
import { User, hasUserFlag } from "@/lib/permissions";

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "waiting_client"
  | "on_hold"
  | "completed_month";

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus | string;
  assigneeId?: number | null;
  assignee?: {
    id: number;
    name: string;
    email: string;
  } | null;
  priority?: "low" | "medium" | "high" | string | null;
  dueDate?: Date | string | null;
  tags?: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

const COLUMNS: { id: TaskStatus; title: string; color: string }[] = [
  { id: "todo", title: "משימות", color: "from-slate-600 to-slate-700" },
  {
    id: "in_progress",
    title: "משימות בטיפול",
    color: "from-purple-600 to-purple-700",
  },
  {
    id: "waiting_client",
    title: "ממתינים לאישור לקוח",
    color: "from-amber-600 to-amber-700",
  },
  {
    id: "on_hold",
    title: "משימות בהשהייה",
    color: "from-gray-500 to-gray-600",
  },
  {
    id: "completed_month",
    title: "בוצעו החודש",
    color: "from-emerald-600 to-emerald-700",
  },
];

import TasksFilterSidebar, {
  TaskFilters,
} from "@/components/tasks/TasksFilterSidebar";

interface TaskKanbanBoardProps {
  currentUser: User | null;
  users?: { id: number; name: string }[];
}

export default function TaskKanbanBoard({
  currentUser,
  users = [],
}: TaskKanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<TaskStatus>("todo");
  const [filters, setFilters] = useState<TaskFilters>({
    assigneeId: null,
    priority: null,
    dueDate: null,
    startDate: null,
  });

  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const canCreate =
    currentUser &&
    (currentUser.role === "admin" ||
      hasUserFlag(currentUser, "canCreateTasks"));

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setIsLoading(true);
      const { getTasks } = await import("@/app/actions");
      const result = await getTasks();
      if (result.success) {
        setTasks(result.data! as Task[]);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTaskMove = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const { updateTask } = await import("@/app/actions");
      const result = await updateTask(taskId, { status: newStatus });
      if (result.success) {
        setTasks(
          tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
        );
      }
    } catch (error) {
      console.error("Error updating task:", error);
    }
  };

  const handleTaskCreate = (status?: TaskStatus) => {
    // If no status provided, default to 'todo'; user can change via modal select
    setModalStatus(status ?? "todo");
    setEditingTask(null);
    setModalOpen(true);
  };

  const handleTaskEdit = (task: Task) => {
    setEditingTask(task);
    setModalStatus(task.status as TaskStatus);
    setModalOpen(true);
  };

  const handleTaskUpdate = (updatedTask: Task) => {
    setTasks(tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
  };

  const handleTaskDelete = async (taskId: string) => {
    try {
      const { deleteTask } = await import("@/app/actions");
      const result = await deleteTask(taskId);
      if (result.success) {
        setTasks(tasks.filter((t) => t.id !== taskId));
      } else {
        console.error("Failed to delete task");
        alert("שגיאה במחיקת המשימה");
      }
    } catch (error) {
      console.error("Error deleting task:", error);
      alert("שגיאה במחיקת המשימה");
    }
  };

  const filteredTasks = tasks.filter((t) => {
    // Text search
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Sidebar Filters
    if (filters.assigneeId && t.assigneeId !== filters.assigneeId) return false;
    if (filters.priority && t.priority !== filters.priority) return false;

    if (filters.dueDate) {
      if (!t.dueDate) return false;
      const taskDue = new Date(t.dueDate).toISOString().split("T")[0];
      if (taskDue !== filters.dueDate) return false;
    }

    if (filters.startDate) {
      // Assuming startDate maps to createdAt
      const taskStart = new Date(t.createdAt).toISOString().split("T")[0];
      if (taskStart !== filters.startDate) return false;
    }

    return true;
  });

  const getTasksByStatus = (status: TaskStatus) =>
    filteredTasks.filter((t) => t.status === status);

  return (
    <div className="space-y-6">
      {/* Search & Add */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-slate-800/50 backdrop-blur-sm p-4 rounded-xl border border-slate-700/50">
        <div className="flex-1 relative">
          <span
            className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
            role="img"
            aria-label="search"
          >
            🔍
          </span>
          <input
            type="text"
            placeholder="חיפוש משימות..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/50 text-white placeholder-slate-400 border border-slate-600 rounded-lg px-4 py-2 ps-10 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
        {canCreate && (
          <button
            onClick={() => handleTaskCreate()}
            className="flex items-center justify-center md:justify-start gap-2 bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-2 rounded-lg transition-all shadow-lg hover:shadow-blue-500/50 font-medium"
          >
            <span className="w-5 h-5" role="img" aria-label="plus">
              +
            </span>
            משימה חדשה
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Sidebar */}
        <div className="w-full md:w-64 shrink-0 md:sticky md:top-24">
          <TasksFilterSidebar
            filters={filters}
            onChange={setFilters}
            users={users}
          />
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto w-full">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 min-w-[800px] lg:min-w-0">
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.id}
                  title={col.title}
                  color={col.color}
                  tasks={getTasksByStatus(col.id)}
                  onTaskMove={handleTaskMove}
                  onTaskCreate={() => handleTaskCreate(col.id)}
                  onTaskDelete={handleTaskDelete}
                  onTaskEdit={handleTaskEdit}
                  status={col.id}
                  canCreate={canCreate ?? false}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <TaskModal
          status={modalStatus}
          task={editingTask}
          onClose={() => {
            setModalOpen(false);
            setEditingTask(null);
          }}
          onCreated={(newTask) => setTasks([...tasks, newTask])}
          onUpdated={handleTaskUpdate}
        />
      )}
    </div>
  );
}
