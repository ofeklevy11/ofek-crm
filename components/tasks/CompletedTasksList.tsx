"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Calendar,
  Tag,
  User,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Trash2,
  Rocket,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import TaskModal from "@/components/TaskModal";
import AlertDialog from "@/components/AlertDialog";
import { deleteTask } from "@/app/actions/tasks";

interface DoneTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assigneeId: number | null;
  priority: string | null;
  dueDate: string | null;
  tags: string[];
  creatorId: number | null;
  createdAt: string;
  updatedAt: string;
  assignee: { id: number; name: string | null } | null;
  creator: { id: number; name: string | null } | null;
}

interface CompletedTasksListProps {
  tasks: DoneTask[];
}

const PRIORITY_BADGE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  high: { bg: "bg-red-500/20", text: "text-red-400", label: "גבוהה" },
  medium: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "בינונית" },
  low: { bg: "bg-green-500/20", text: "text-green-400", label: "נמוכה" },
};

function formatDate(dateValue?: string | null) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  return date.toLocaleDateString("he-IL", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const TASKS_PER_PAGE = 20;

export default function CompletedTasksList({
  tasks: initialTasks,
}: CompletedTasksListProps) {
  const [tasks, setTasks] = useState<DoneTask[]>(initialTasks);
  const [editingTask, setEditingTask] = useState<DoneTask | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterAssigneeId, setFilterAssigneeId] = useState<number | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState<string | null>(null);
  const [filterDateTo, setFilterDateTo] = useState<string | null>(null);

  const uniqueAssignees = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of tasks) {
      if (t.assignee?.id && t.assignee.name) map.set(t.assignee.id, t.assignee.name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [tasks]);

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) t.tags?.forEach((tag) => set.add(tag));
    return Array.from(set).sort();
  }, [tasks]);

  const hasActiveFilters = !!(searchQuery || filterPriority || filterAssigneeId || filterTag || filterDateFrom || filterDateTo);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false;
      }
      if (filterPriority && t.priority !== filterPriority) return false;
      if (filterAssigneeId && t.assigneeId !== filterAssigneeId) return false;
      if (filterTag && !t.tags?.includes(filterTag)) return false;
      if (filterDateFrom) {
        const completed = t.updatedAt.split("T")[0];
        if (completed < filterDateFrom) return false;
      }
      if (filterDateTo) {
        const completed = t.updatedAt.split("T")[0];
        if (completed > filterDateTo) return false;
      }
      return true;
    });
  }, [tasks, searchQuery, filterPriority, filterAssigneeId, filterTag, filterDateFrom, filterDateTo]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterPriority, filterAssigneeId, filterTag, filterDateFrom, filterDateTo]);

  const totalPages = Math.ceil(filteredTasks.length / TASKS_PER_PAGE);
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * TASKS_PER_PAGE;
    return filteredTasks.slice(start, start + TASKS_PER_PAGE);
  }, [filteredTasks, currentPage]);

  const clearFilters = () => {
    setSearchQuery("");
    setFilterPriority(null);
    setFilterAssigneeId(null);
    setFilterTag(null);
    setFilterDateFrom(null);
    setFilterDateTo(null);
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      const result = await deleteTask(confirmDeleteId);
      if (result.success) {
        setTasks((prev) => prev.filter((t) => t.id !== confirmDeleteId));
      } else {
        alert(result.error || "מחיקה נכשלה");
      }
    } catch {
      alert("שגיאה במחיקת המשימה");
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  const handleUpdated = (updatedTask: any) => {
    if (updatedTask.status !== "done") {
      // Task no longer "done" — remove from this list
      setTasks((prev) => prev.filter((t) => t.id !== String(updatedTask.id)));
    } else {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === String(updatedTask.id)
            ? {
                ...t,
                ...updatedTask,
                id: String(updatedTask.id),
                dueDate: updatedTask.dueDate
                  ? new Date(updatedTask.dueDate).toISOString()
                  : null,
                createdAt: new Date(updatedTask.createdAt).toISOString(),
                updatedAt: new Date(updatedTask.updatedAt).toISOString(),
              }
            : t,
        ),
      );
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <CheckCircle2 className="w-16 h-16 mb-4 text-slate-600" />
        <p className="text-lg font-medium">אין משימות שבוצעו</p>
        <p className="text-sm mt-1">
          משימות שיסומנו כ&quot;בוצעו&quot; יופיעו כאן
        </p>
      </div>
    );
  }

  const inputClass = "bg-slate-900/50 text-white border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50";

  return (
    <>
      {/* Filter bar */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="חיפוש משימה..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${inputClass} pr-9 w-52`}
            />
          </div>
          <select
            value={filterPriority ?? ""}
            onChange={(e) => setFilterPriority(e.target.value || null)}
            className={`${inputClass} min-w-[120px]`}
          >
            <option value="">עדיפות</option>
            <option value="high">גבוהה</option>
            <option value="medium">בינונית</option>
            <option value="low">נמוכה</option>
          </select>
          <select
            value={filterAssigneeId ?? ""}
            onChange={(e) => setFilterAssigneeId(e.target.value ? Number(e.target.value) : null)}
            className={`${inputClass} min-w-[140px]`}
          >
            <option value="">אחראי</option>
            {uniqueAssignees.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            value={filterTag ?? ""}
            onChange={(e) => setFilterTag(e.target.value || null)}
            className={`${inputClass} min-w-[120px]`}
          >
            <option value="">תגית</option>
            {uniqueTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Calendar className="w-4 h-4" />
            <span>מתאריך</span>
            <input
              type="date"
              value={filterDateFrom ?? ""}
              onChange={(e) => setFilterDateFrom(e.target.value || null)}
              className={inputClass}
            />
            <span>עד תאריך</span>
            <input
              type="date"
              value={filterDateTo ?? ""}
              onChange={(e) => setFilterDateTo(e.target.value || null)}
              className={inputClass}
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors mr-auto"
            >
              <X className="w-4 h-4" />
              נקה פילטרים
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-slate-400">
          {(() => {
            const start = (currentPage - 1) * TASKS_PER_PAGE + 1;
            const end = Math.min(currentPage * TASKS_PER_PAGE, filteredTasks.length);
            if (hasActiveFilters) {
              return totalPages > 1
                ? `${start}-${end} מתוך ${filteredTasks.length} משימות (סה"כ ${tasks.length})`
                : `${filteredTasks.length} מתוך ${tasks.length} משימות`;
            }
            return totalPages > 1
              ? `${start}-${end} מתוך ${tasks.length} משימות`
              : `${tasks.length} משימות`;
          })()}
        </span>
      </div>

      {filteredTasks.length === 0 && hasActiveFilters ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Search className="w-16 h-16 mb-4 text-slate-600" />
          <p className="text-lg font-medium">לא נמצאו משימות התואמות לפילטרים</p>
          <button
            onClick={clearFilters}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            נקה פילטרים
          </button>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {paginatedTasks.map((task) => {
          const priority = task.priority ? PRIORITY_BADGE[task.priority] : null;
          return (
            <div
              key={task.id}
              className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800/80 transition-colors flex flex-col"
            >
              {/* Top row: priority + actions */}
              <div className="flex items-center justify-between mb-2">
                {priority ? (
                  <span
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${priority.bg} ${priority.text}`}
                  >
                    {task.priority === "high" && (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {priority.label}
                  </span>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingTask(task)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                    title="עריכה"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(task.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="מחיקה"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Title */}
              <h3 className="text-white font-medium truncate mb-1">
                {task.title}
              </h3>

              {/* Dates row */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <Rocket className="w-3 h-3" />
                  {formatDate(task.createdAt)}
                </span>
                {task.dueDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(task.dueDate)}
                  </span>
                )}
              </div>

              {/* Description */}
              {task.description && (
                <p className="text-slate-400 text-sm line-clamp-2 mb-2">
                  {task.description}
                </p>
              )}

              {/* Tags */}
              {task.tags && task.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {task.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 text-xs bg-blue-500/15 text-blue-300 px-2 py-0.5 rounded-full"
                    >
                      <Tag className="w-2.5 h-2.5" />
                      {tag}
                    </span>
                  ))}
                  {task.tags.length > 3 && (
                    <span className="text-xs text-slate-500">
                      +{task.tags.length - 3}
                    </span>
                  )}
                </div>
              )}

              {/* Separator + footer */}
              <div className="mt-auto pt-2 border-t border-slate-700/50">
                {task.assignee?.name && (
                  <span className="flex items-center gap-1 text-xs text-slate-400 mb-1">
                    <User className="w-3 h-3" />
                    {task.assignee.name}
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  הושלם: {formatDate(task.updatedAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 mt-4 flex items-center justify-center gap-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
            הקודם
          </button>
          <span className="text-sm text-slate-400">
            עמוד {currentPage} מתוך {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            הבא
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}
      </>
      )}

      {/* Edit modal */}
      {editingTask && (
        <TaskModal
          status="done"
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onCreated={() => {}}
          onUpdated={handleUpdated}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        title="מחיקת משימה"
        description="האם אתה בטוח שברצונך למחוק את המשימה? פעולה זו לא ניתנת לביטול."
        confirmText={deleting ? "מוחק..." : "מחק"}
        cancelText="ביטול"
        isDestructive
      />
    </>
  );
}
