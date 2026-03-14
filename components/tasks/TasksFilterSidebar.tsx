"use client";

import React from "react";
import {
  User,
  X,
  Calendar,
  User as UserIcon,
  AlertCircle,
  Clock,
  RotateCcw,
} from "lucide-react";

export interface TaskFilters {
  assigneeId: number | null;
  priority: string | null;
  dueDate: string | null; // ISO string YYYY-MM-DD
  startDate: string | null; // ISO string YYYY-MM-DD
}

interface TasksFilterSidebarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  users: { id: number; name: string }[];
  className?: string;
}

export default function TasksFilterSidebar({
  filters,
  onChange,
  users,
  className = "",
}: TasksFilterSidebarProps) {
  const handleChange = (key: keyof TaskFilters, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  const clearAllFilters = () => {
    onChange({
      assigneeId: null,
      priority: null,
      dueDate: null,
      startDate: null,
    });
  };

  const hasActiveFilters =
    filters.assigneeId !== null ||
    filters.priority !== null ||
    filters.dueDate !== null ||
    filters.startDate !== null;

  return (
    <div
      role="search"
      aria-label="פילטרים למשימות"
      id="filter-sidebar"
      className={`bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-10rem)] overflow-hidden ${className}`}
    >
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-lg">
          <span className="w-1.5 h-6 bg-blue-500 rounded-full" aria-hidden="true"></span>
          פילטרים
        </h3>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1 font-medium focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            <RotateCcw className="w-3 h-3" />
            נקה הכל
          </button>
        )}
      </div>

      <div className="p-6 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
        {/* Assignee Filter */}
        <div className="space-y-3">
          <label htmlFor="filter-assignee" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-slate-400" />
            אחראי משימה
          </label>
          <div className="relative group">
            <select
              id="filter-assignee"
              value={filters.assigneeId || ""}
              onChange={(e) =>
                handleChange(
                  "assigneeId",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer hover:bg-slate-100 text-slate-700"
            >
              <option value="">כל העובדים</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 group-hover:text-blue-500 transition-colors">
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Priority Filter */}
        <div className="space-y-3">
          <label htmlFor="filter-priority" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-400" />
            דחיפות משימה
          </label>
          <div className="relative group">
            <select
              id="filter-priority"
              value={filters.priority || ""}
              onChange={(e) => handleChange("priority", e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer hover:bg-slate-100 text-slate-700"
            >
              <option value="">כל הדחיפויות</option>
              <option value="low">נמוכה</option>
              <option value="medium">בינונית</option>
              <option value="high">גבוהה</option>
              <option value="critical">קריטית</option>
            </select>
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 group-hover:text-blue-500 transition-colors">
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Due Date Filter */}
        <div className="space-y-3">
          <label htmlFor="filter-dueDate" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            תאריך יעד לסיום
          </label>
          <div className="relative group">
            <input
              id="filter-dueDate"
              type="date"
              value={filters.dueDate || ""}
              onChange={(e) => handleChange("dueDate", e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all hover:bg-slate-100 text-slate-700"
            />
          </div>
        </div>

        {/* Start Date Filter */}
        <div className="space-y-3">
          <label htmlFor="filter-startDate" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            תאריך התחלת משימה
          </label>
          <div className="relative group">
            <input
              id="filter-startDate"
              type="date"
              value={filters.startDate || ""}
              onChange={(e) =>
                handleChange("startDate", e.target.value || null)
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all hover:bg-slate-100 text-slate-700"
            />
          </div>
        </div>
      </div>

      {/* Footer / Clear Button (Bottom Fixed) */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/30 shrink-0">
        <button
          onClick={clearAllFilters}
          disabled={!hasActiveFilters}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border font-medium transition-all focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
            hasActiveFilters
              ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm hover:shadow-md"
              : "bg-slate-50 border-transparent text-slate-400 cursor-not-allowed"
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          {hasActiveFilters ? "נקה פילטרים" : "אין פילטרים פעילים"}
        </button>
      </div>
    </div>
  );
}
