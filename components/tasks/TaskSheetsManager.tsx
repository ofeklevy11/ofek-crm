"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Edit2,
  MoreVertical,
  User,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Save,
  Users,
  AlertTriangle,
  Sparkles,
  Timer,
  Settings2,
} from "lucide-react";
import AlertDialog from "@/components/AlertDialog";
import TaskItemAutomations from "./TaskItemAutomations";

interface TaskSheetItem {
  id: number;
  title: string;
  description?: string | null;
  priority: string;
  category?: string | null;
  order: number;
  isCompleted: boolean;
  completedAt?: string | null;
  dueTime?: string | null;
}

interface TaskSheet {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  assigneeId: number;
  assignee: {
    id: number;
    name: string;
    email: string;
  };
  createdBy: {
    id: number;
    name: string;
  };
  validFrom: string;
  validUntil?: string | null;
  isActive: boolean;
  items: TaskSheetItem[];
  _count?: {
    items: number;
  };
}

interface UserOption {
  id: number;
  name: string;
  email: string;
}

interface TaskSheetsManagerProps {
  initialSheets: TaskSheet[];
  users: UserOption[];
}

const priorityOptions = [
  { value: "URGENT", label: "דחוף", color: "text-red-400" },
  { value: "HIGH", label: "גבוה", color: "text-orange-400" },
  { value: "NORMAL", label: "רגיל", color: "text-blue-400" },
  { value: "LOW", label: "נמוך", color: "text-slate-400" },
  { value: "OPPORTUNITY", label: "הזדמנות", color: "text-emerald-400" },
];

interface NewItemType {
  title: string;
  description: string;
  priority: string;
  category: string;
  dueTime: string;
  onCompleteActions: Array<{
    actionType:
      | "UPDATE_RECORD"
      | "CREATE_TASK"
      | "CREATE_FINANCE"
      | "SEND_NOTIFICATION"
      | "UPDATE_TASK";
    config: Record<string, unknown>;
  }>;
}

export default function TaskSheetsManager({
  initialSheets,
  users,
}: TaskSheetsManagerProps) {
  const [sheets, setSheets] = useState<TaskSheet[]>(initialSheets);
  const [isCreating, setIsCreating] = useState(false);
  const [editingSheet, setEditingSheet] = useState<TaskSheet | null>(null);
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<Array<{ id: number; name: string }>>([]);
  const [expandedExistingItems, setExpandedExistingItems] = useState<
    Set<number>
  >(new Set());
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingItemData, setEditingItemData] = useState<{
    title: string;
    description: string;
    priority: string;
    category: string;
    dueTime: string;
    onCompleteActions: Array<{
      actionType:
        | "UPDATE_RECORD"
        | "CREATE_TASK"
        | "CREATE_FINANCE"
        | "SEND_NOTIFICATION"
        | "UPDATE_TASK";
      config: Record<string, unknown>;
    }>;
  } | null>(null);

  // Fetch tables for automations (lazy load, non-blocking)
  useEffect(() => {
    const fetchTables = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const res = await fetch("/api/tables", { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          setTables(
            (data || []).map((t: { id: number; name: string }) => ({
              id: t.id,
              name: t.name,
            }))
          );
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Failed to fetch tables:", error);
        }
      }
    };
    fetchTables();
  }, []);

  // Form state for new/edit sheet
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "DAILY" as "DAILY" | "WEEKLY",
    assigneeId: 0,
    validFrom: new Date().toISOString().split("T")[0],
    validUntil: "",
  });

  // Items for new/edit sheet
  const [newItems, setNewItems] = useState<NewItemType[]>([]);

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      type: "DAILY",
      assigneeId: 0,
      validFrom: new Date().toISOString().split("T")[0],
      validUntil: "",
    });
    setNewItems([]);
  };

  const openCreateModal = () => {
    resetForm();
    setEditingSheet(null);
    setIsCreating(true);
  };

  const openEditModal = (sheet: TaskSheet) => {
    setFormData({
      title: sheet.title,
      description: sheet.description || "",
      type: sheet.type as "DAILY" | "WEEKLY",
      assigneeId: sheet.assigneeId,
      validFrom: new Date(sheet.validFrom).toISOString().split("T")[0],
      validUntil: sheet.validUntil
        ? new Date(sheet.validUntil).toISOString().split("T")[0]
        : "",
    });
    setNewItems([]); // Start with empty new items for editing
    setEditingSheet(sheet);
    setIsCreating(true);
  };

  const closeModal = () => {
    setIsCreating(false);
    setEditingSheet(null);
    resetForm();
  };

  const addNewItem = () => {
    setNewItems([
      ...newItems,
      {
        title: "",
        description: "",
        priority: "NORMAL",
        category: "",
        dueTime: "",
        onCompleteActions: [],
      },
    ]);
  };

  const updateNewItem = (index: number, field: string, value: unknown) => {
    setNewItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const removeNewItem = (index: number) => {
    setNewItems((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleExistingItem = (itemId: number) => {
    setExpandedExistingItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const startEditingItem = (item: TaskSheetItem) => {
    setEditingItemId(item.id);
    setEditingItemData({
      title: item.title,
      description: item.description || "",
      priority: item.priority,
      category: item.category || "",
      dueTime: item.dueTime || "",
      onCompleteActions: [], // Will be loaded from API if needed
    });
    setExpandedExistingItems((prev) => new Set([...prev, item.id]));
  };

  const cancelEditingItem = () => {
    setEditingItemId(null);
    setEditingItemData(null);
  };

  const saveEditingItem = async () => {
    if (!editingItemId || !editingItemData || !editingSheet) return;

    try {
      const { updateTaskSheetItem } = await import("@/app/actions");
      const result = await updateTaskSheetItem(editingItemId, {
        title: editingItemData.title,
        description: editingItemData.description || undefined,
        priority: editingItemData.priority,
        category: editingItemData.category || undefined,
        dueTime: editingItemData.dueTime || undefined,
      });

      if (result.success) {
        // Update both editingSheet and sheets state
        const updatedItem = result.data as unknown as TaskSheetItem;
        setEditingSheet((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.id === editingItemId ? { ...item, ...updatedItem } : item
                ),
              }
            : null
        );
        setSheets((prev) =>
          prev.map((sheet) =>
            sheet.id === editingSheet.id
              ? {
                  ...sheet,
                  items: sheet.items.map((item) =>
                    item.id === editingItemId
                      ? { ...item, ...updatedItem }
                      : item
                  ),
                }
              : sheet
          )
        );
        cancelEditingItem();
      }
    } catch (error) {
      console.error("Error updating item:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.title) {
      setFormError("יש להזין כותרת");
      return;
    }

    if (!formData.assigneeId || formData.assigneeId === 0) {
      setFormError("יש לבחור עובד");
      return;
    }

    setLoading(true);
    try {
      if (editingSheet) {
        // Update existing sheet
        const { updateTaskSheet, addTaskSheetItem } = await import(
          "@/app/actions"
        );
        const result = await updateTaskSheet(editingSheet.id, {
          title: formData.title,
          description: formData.description || undefined,
          type: formData.type,
          assigneeId: formData.assigneeId,
          validFrom: formData.validFrom,
          validUntil: formData.validUntil || undefined,
        });

        // Also add any new items
        if (result.success && newItems.length > 0) {
          const newItemsToAdd = newItems.filter((item) => item.title.trim());
          const addedItems: TaskSheetItem[] = [];
          for (const item of newItemsToAdd) {
            const itemResult = await addTaskSheetItem(editingSheet.id, {
              title: item.title,
              description: item.description || undefined,
              priority: item.priority,
              category: item.category || undefined,
              dueTime: item.dueTime || undefined,
              onCompleteActions: item.onCompleteActions,
            });
            if (itemResult.success && itemResult.data) {
              const newItem = itemResult.data as unknown as TaskSheetItem;
              addedItems.push(newItem);
            }
          }
          // Update local state with new items
          setSheets((prev) =>
            prev.map((s) =>
              s.id === editingSheet.id
                ? { ...s, items: [...s.items, ...addedItems] }
                : s
            )
          );
        }
        closeModal();
      } else {
        // Create new sheet
        const { createTaskSheet } = await import("@/app/actions");
        const result = await createTaskSheet({
          title: formData.title,
          description: formData.description || undefined,
          type: formData.type,
          assigneeId: formData.assigneeId,
          validFrom: formData.validFrom,
          validUntil: formData.validUntil || undefined,
          items: newItems
            .filter((item) => item.title.trim())
            .map((item, index) => ({
              title: item.title,
              description: item.description || undefined,
              priority: item.priority,
              category: item.category || undefined,
              dueTime: item.dueTime || undefined,
              order: index,
              onCompleteActions: item.onCompleteActions,
            })),
        });

        if (result.success && result.data) {
          // Fetch the user info to add to the sheet
          const assignee = users.find((u) => u.id === formData.assigneeId);
          const newSheet: TaskSheet = {
            id: result.data.id,
            title: result.data.title,
            description: result.data.description,
            type: result.data.type,
            assigneeId: result.data.assigneeId,
            assignee: assignee || {
              id: formData.assigneeId,
              name: "Unknown",
              email: "",
            },
            createdBy: { id: 0, name: "You" },
            validFrom:
              typeof result.data.validFrom === "string"
                ? result.data.validFrom
                : result.data.validFrom.toISOString(),
            validUntil: result.data.validUntil
              ? typeof result.data.validUntil === "string"
                ? result.data.validUntil
                : result.data.validUntil.toISOString()
              : null,
            isActive: result.data.isActive,
            items: (
              (result.data as { items?: TaskSheetItem[] }).items || []
            ).map((item: TaskSheetItem) => ({
              id: item.id,
              title: item.title,
              description: item.description,
              priority: item.priority,
              category: item.category,
              order: item.order,
              isCompleted: item.isCompleted,
              completedAt: item.completedAt,
              dueTime: item.dueTime,
            })),
          };
          setSheets((prev) => [newSheet, ...prev]);
          closeModal();
        }
      }
    } catch (error) {
      console.error("Error saving task sheet:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sheetId: number) => {
    setLoading(true);
    try {
      const { deleteTaskSheet } = await import("@/app/actions");
      const result = await deleteTaskSheet(sheetId);
      if (result.success) {
        setSheets((prev) => prev.filter((s) => s.id !== sheetId));
      }
    } catch (error) {
      console.error("Error deleting task sheet:", error);
    } finally {
      setLoading(false);
      setDeleteConfirm(null);
    }
  };

  const handleAddItemToSheet = async (sheetId: number) => {
    const title = prompt("הכנס שם פריט:");
    if (!title) return;

    try {
      const { addTaskSheetItem } = await import("@/app/actions");
      const result = await addTaskSheetItem(sheetId, { title });
      if (result.success && result.data) {
        setSheets((prev) =>
          prev.map((s) =>
            s.id === sheetId
              ? { ...s, items: [...s.items, result.data as TaskSheetItem] }
              : s
          )
        );
      }
    } catch (error) {
      console.error("Error adding item:", error);
    }
  };

  const handleDeleteItem = async (sheetId: number, itemId: number) => {
    try {
      const { deleteTaskSheetItem } = await import("@/app/actions");
      const result = await deleteTaskSheetItem(itemId);
      if (result.success) {
        setSheets((prev) =>
          prev.map((s) =>
            s.id === sheetId
              ? { ...s, items: s.items.filter((i) => i.id !== itemId) }
              : s
          )
        );
      }
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const toggleSheet = (sheetId: number) => {
    setExpandedSheets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sheetId)) {
        newSet.delete(sheetId);
      } else {
        newSet.add(sheetId);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">ניהול דפי משימות</h2>
          <p className="text-slate-400 text-sm mt-1">
            צור וערוך דפי משימות יומיים/שבועיים לעובדים
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg hover:shadow-blue-500/30 font-medium"
        >
          <Plus className="w-5 h-5" />
          דף משימות חדש
        </button>
      </div>

      {/* Sheets List */}
      {sheets.length === 0 ? (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-12 text-center">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-slate-500 opacity-50" />
          <h3 className="text-xl font-medium text-white mb-2">
            אין דפי משימות
          </h3>
          <p className="text-slate-400 mb-6">
            צור את דף המשימות הראשון שלך לעובדים
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-colors"
          >
            <Plus className="w-5 h-5" />
            צור דף משימות
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {sheets.map((sheet) => {
            const isExpanded = expandedSheets.has(sheet.id);
            const completedCount = sheet.items.filter(
              (i) => i.isCompleted
            ).length;
            const progress =
              sheet.items.length > 0
                ? Math.round((completedCount / sheet.items.length) * 100)
                : 0;

            return (
              <div
                key={sheet.id}
                className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden"
              >
                {/* Sheet Header */}
                <div className="p-4 flex items-center justify-between">
                  <button
                    onClick={() => toggleSheet(sheet.id)}
                    className="flex items-center gap-3 flex-1 text-start"
                  >
                    <div
                      className={`p-2.5 rounded-lg ${
                        sheet.type === "DAILY"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-purple-500/20 text-purple-400"
                      }`}
                    >
                      {sheet.type === "DAILY" ? (
                        <Clock className="w-5 h-5" />
                      ) : (
                        <Calendar className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white flex items-center gap-2">
                        {sheet.title}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            sheet.type === "DAILY"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-purple-500/20 text-purple-400"
                          }`}
                        >
                          {sheet.type === "DAILY" ? "יומי" : "שבועי"}
                        </span>
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {sheet.assignee.name}
                        </span>
                        <span>•</span>
                        <span>
                          {sheet.items.length} פריטים ({completedCount} הושלמו)
                        </span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-slate-400 ms-auto" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400 ms-auto" />
                    )}
                  </button>

                  {/* Progress Bar */}
                  <div className="flex items-center gap-3 mx-4">
                    <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          progress === 100
                            ? "bg-emerald-500"
                            : progress >= 50
                            ? "bg-blue-500"
                            : "bg-amber-500"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-300 w-12">
                      {progress}%
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(sheet)}
                      className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                      title="ערוך"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(sheet.id)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="מחק"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-slate-700/50 p-4">
                    {sheet.items.length === 0 ? (
                      <div className="text-center py-6 text-slate-400">
                        <Circle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>אין פריטים בדף משימה זה</p>
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {sheet.items.map((item) => (
                          <li
                            key={item.id}
                            className={`flex items-center gap-3 p-3 rounded-lg ${
                              item.isCompleted
                                ? "bg-slate-900/30 opacity-60"
                                : "bg-slate-700/30"
                            }`}
                          >
                            {item.isCompleted ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <Circle className="w-5 h-5 text-slate-500 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span
                                className={`${
                                  item.isCompleted
                                    ? "line-through text-slate-500"
                                    : "text-white"
                                }`}
                              >
                                {item.title}
                              </span>
                              {item.dueTime && (
                                <span className="text-xs text-slate-500 ms-2">
                                  ({item.dueTime})
                                </span>
                              )}
                            </div>
                            <span
                              className={`text-xs px-2 py-1 rounded-full ${
                                item.priority === "URGENT"
                                  ? "bg-red-500/20 text-red-400"
                                  : item.priority === "HIGH"
                                  ? "bg-orange-500/20 text-orange-400"
                                  : item.priority === "OPPORTUNITY"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : item.priority === "LOW"
                                  ? "bg-slate-500/20 text-slate-400"
                                  : "bg-blue-500/20 text-blue-400"
                              }`}
                            >
                              {priorityOptions.find(
                                (p) => p.value === item.priority
                              )?.label || "רגיל"}
                            </span>
                            <button
                              onClick={() =>
                                handleDeleteItem(sheet.id, item.id)
                              }
                              className="p-1.5 text-slate-500 hover:text-red-400 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      onClick={() => handleAddItemToSheet(sheet.id)}
                      className="mt-3 flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      הוסף פריט
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">
                {editingSheet ? "עריכת דף משימות" : "יצירת דף משימות חדש"}
              </h3>
              <button
                onClick={closeModal}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Error Message */}
              {formError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  כותרת *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="לדוגמה: משימות יומיות - צוות מכירות"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  תיאור
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="תיאור קצר של דף המשימות..."
                  rows={2}
                />
              </div>

              {/* Type & Assignee */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    סוג *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        type: e.target.value as "DAILY" | "WEEKLY",
                      })
                    }
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="DAILY">יומי</option>
                    <option value="WEEKLY">שבועי</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    הקצה לעובד *
                  </label>
                  <select
                    value={formData.assigneeId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        assigneeId: parseInt(e.target.value),
                      })
                    }
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value={0}>בחר עובד...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Valid From/Until */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    תחילה מ-
                  </label>
                  <input
                    type="date"
                    value={formData.validFrom}
                    onChange={(e) =>
                      setFormData({ ...formData, validFrom: e.target.value })
                    }
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    עד (אופציונלי)
                  </label>
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) =>
                      setFormData({ ...formData, validUntil: e.target.value })
                    }
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Existing Items (only when editing) */}
              {editingSheet && editingSheet.items.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-300">
                      פריטים קיימים ({editingSheet.items.length})
                    </label>
                  </div>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {editingSheet.items.map((item) => {
                      const isExpanded = expandedExistingItems.has(item.id);
                      const isEditing = editingItemId === item.id;
                      const priorityInfo = priorityOptions.find(
                        (p) => p.value === item.priority
                      );
                      return (
                        <div
                          key={item.id}
                          className={`bg-slate-800/50 border rounded-lg transition-colors ${
                            item.isCompleted
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : isEditing
                              ? "border-blue-500/50 bg-blue-500/5"
                              : "border-slate-600"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleExistingItem(item.id)}
                            className="w-full flex items-center justify-between p-3 text-start"
                          >
                            <div className="flex items-center gap-3">
                              {item.isCompleted ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              ) : (
                                <Circle className="w-4 h-4 text-slate-500 shrink-0" />
                              )}
                              <span
                                className={`text-sm ${
                                  item.isCompleted
                                    ? "text-slate-400 line-through"
                                    : "text-white"
                                }`}
                              >
                                {item.title}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  item.priority === "URGENT"
                                    ? "bg-red-500/20 text-red-400"
                                    : item.priority === "HIGH"
                                    ? "bg-orange-500/20 text-orange-400"
                                    : item.priority === "OPPORTUNITY"
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : item.priority === "LOW"
                                    ? "bg-slate-500/20 text-slate-400"
                                    : "bg-blue-500/20 text-blue-400"
                                }`}
                              >
                                {priorityInfo?.label || "רגיל"}
                              </span>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-0 border-t border-slate-700/50 mt-0">
                              {isEditing && editingItemData ? (
                                /* Edit Mode */
                                <div className="space-y-3 mt-3">
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="text"
                                      value={editingItemData.title}
                                      onChange={(e) =>
                                        setEditingItemData({
                                          ...editingItemData,
                                          title: e.target.value,
                                        })
                                      }
                                      placeholder="שם הפריט *"
                                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <select
                                      value={editingItemData.priority}
                                      onChange={(e) =>
                                        setEditingItemData({
                                          ...editingItemData,
                                          priority: e.target.value,
                                        })
                                      }
                                      className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      {priorityOptions.map((p) => (
                                        <option key={p.value} value={p.value}>
                                          {p.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <input
                                      type="text"
                                      value={editingItemData.category}
                                      onChange={(e) =>
                                        setEditingItemData({
                                          ...editingItemData,
                                          category: e.target.value,
                                        })
                                      }
                                      placeholder="קטגוריה (אופציונלי)"
                                      className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <input
                                      type="time"
                                      value={editingItemData.dueTime}
                                      onChange={(e) =>
                                        setEditingItemData({
                                          ...editingItemData,
                                          dueTime: e.target.value,
                                        })
                                      }
                                      className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <textarea
                                    value={editingItemData.description}
                                    onChange={(e) =>
                                      setEditingItemData({
                                        ...editingItemData,
                                        description: e.target.value,
                                      })
                                    }
                                    placeholder="תיאור (אופציונלי)"
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    rows={2}
                                  />

                                  {/* Automations for editing item */}
                                  <TaskItemAutomations
                                    actions={editingItemData.onCompleteActions}
                                    onChange={(actions) =>
                                      setEditingItemData({
                                        ...editingItemData,
                                        onCompleteActions: actions,
                                      })
                                    }
                                    users={users.map((u) => ({
                                      id: u.id,
                                      name: u.name,
                                    }))}
                                    tables={tables}
                                  />

                                  <div className="flex justify-end gap-2 mt-2">
                                    <button
                                      type="button"
                                      onClick={cancelEditingItem}
                                      className="px-3 py-1.5 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                                    >
                                      ביטול
                                    </button>
                                    <button
                                      type="button"
                                      onClick={saveEditingItem}
                                      className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1"
                                    >
                                      <Save className="w-3.5 h-3.5" />
                                      שמור
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* View Mode */
                                <div className="mt-2">
                                  <div className="text-xs text-slate-400 space-y-1">
                                    {item.description && (
                                      <p>
                                        <span className="text-slate-500">
                                          תיאור:
                                        </span>{" "}
                                        {item.description}
                                      </p>
                                    )}
                                    {item.category && (
                                      <p>
                                        <span className="text-slate-500">
                                          קטגוריה:
                                        </span>{" "}
                                        {item.category}
                                      </p>
                                    )}
                                    {item.dueTime && (
                                      <p>
                                        <span className="text-slate-500">
                                          שעת יעד:
                                        </span>{" "}
                                        {item.dueTime}
                                      </p>
                                    )}
                                    {item.isCompleted && item.completedAt && (
                                      <p className="text-emerald-400">
                                        <span className="text-slate-500">
                                          הושלם:
                                        </span>{" "}
                                        {new Date(
                                          item.completedAt
                                        ).toLocaleString("he-IL")}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => startEditingItem(item)}
                                    className="mt-3 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    ערוך פריט
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* New Items section - for both new and edit */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-300">
                    {editingSheet ? "הוסף פריטים חדשים" : "פריטי משימה"}
                  </label>
                  <button
                    type="button"
                    onClick={addNewItem}
                    className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף פריט
                  </button>
                </div>

                {newItems.length > 0 ? (
                  <div className="space-y-4">
                    {newItems.map((item, index) => (
                      <div
                        key={index}
                        className="bg-slate-900/50 border border-slate-600 rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) =>
                              updateNewItem(index, "title", e.target.value)
                            }
                            placeholder="שם הפריט *"
                            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <select
                            value={item.priority}
                            onChange={(e) =>
                              updateNewItem(index, "priority", e.target.value)
                            }
                            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {priorityOptions.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeNewItem(index)}
                            className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="text"
                            value={item.category}
                            onChange={(e) =>
                              updateNewItem(index, "category", e.target.value)
                            }
                            placeholder="קטגוריה (אופציונלי)"
                            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="time"
                            value={item.dueTime}
                            onChange={(e) =>
                              updateNewItem(index, "dueTime", e.target.value)
                            }
                            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <textarea
                          value={item.description}
                          onChange={(e) =>
                            updateNewItem(index, "description", e.target.value)
                          }
                          placeholder="תיאור (אופציונלי)"
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={2}
                        />

                        {/* Automations Section */}
                        <TaskItemAutomations
                          actions={item.onCompleteActions}
                          onChange={(actions) =>
                            updateNewItem(index, "onCompleteActions", actions)
                          }
                          users={users.map((u) => ({ id: u.id, name: u.name }))}
                          tables={tables}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 bg-slate-900/30 rounded-lg border border-dashed border-slate-600">
                    <p>לחץ על "הוסף פריט" להוספת משימות לדף</p>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={loading || !formData.title || !formData.assigneeId}
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg transition-all font-medium"
                >
                  <Save className="w-4 h-4" />
                  {loading
                    ? "שומר..."
                    : editingSheet
                    ? "שמור שינויים"
                    : "צור דף משימות"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="מחיקת דף משימות"
        description="האם אתה בטוח שברצונך למחוק את דף המשימות? כל הפריטים בדף יימחקו."
        confirmText="מחק"
        cancelText="ביטול"
        isDestructive={true}
      />
    </div>
  );
}
