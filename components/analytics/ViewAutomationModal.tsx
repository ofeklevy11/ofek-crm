"use client";

import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Bell,
  CheckSquare,
  ArrowRight,
  Plus,
  Trash2,
  Edit2,
  Zap,
  Power,
} from "lucide-react";
import {
  createAutomationRule,
  getViewAutomations,
  deleteAutomationRule,
  updateAutomationRule,
  toggleAutomationRule,
} from "@/app/actions/automations";
import { getUsers } from "@/app/actions/users";

interface ViewAutomationModalProps {
  view: any;
  onClose: () => void;
  onSuccess: () => void;
  userId: number;
}

export default function ViewAutomationModal({
  view,
  onClose,
  onSuccess,
  userId,
}: ViewAutomationModalProps) {
  // Mode: list, create, edit
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");

  // Data for List Mode
  const [rules, setRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);

  // Data for Edit Mode
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

  // --- Common Helper to Fetch Rules ---
  const fetchRules = async () => {
    setLoadingRules(true);
    try {
      const res = await getViewAutomations(view.viewId || view.id); // Handle custom view ID
      if (res.success && res.data) {
        setRules(res.data);
      }
    } catch (e) {
      console.error("Failed to fetch rules", e);
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [view]);

  // --- Form State (Used for both Create and Edit) ---
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("rawMetric"); // 'rawMetric' maps to the raw value we exposed
  const [operator, setOperator] = useState("lt");
  const [threshold, setThreshold] = useState("0");
  const [frequency, setFrequency] = useState("always"); // always, once, daily, weekly
  const [actionType, setActionType] = useState("SEND_NOTIFICATION");

  // Action: Notification
  const [recipientId, setRecipientId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");

  // Action: Task
  const [taskTitle, setTaskTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [description, setDescription] = useState("");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getUsers().then((res) => {
      if (res.success && res.data) {
        setUsers(res.data);
      }
    });
  }, []);

  // --- Handlers ---

  const handleCreateNew = () => {
    // Reset Form
    setName(`Automation for ${view.ruleName}`);
    setMetric("rawMetric");
    setOperator("lt");
    setThreshold("10"); // Default example
    setFrequency("always");
    setActionType("SEND_NOTIFICATION");
    setRecipientId("");
    setMessageTemplate(
      "Alert: The metric for {view} is {value}, which is {operator} {threshold}."
    );
    setTaskTitle(`Action required: ${view.ruleName}`);
    setAssigneeId("");
    setDescription(`Triggered by view automation.`);
    setTaskStatus("todo");
    setTaskPriority("medium");
    setDueDate("");

    setMode("create");
  };

  const handleEdit = (rule: any) => {
    setEditingRuleId(rule.id);
    setName(rule.name);

    const tConfig = rule.triggerConfig as any;
    setMetric(tConfig.metric || "rawMetric");
    setOperator(tConfig.operator || "lt");
    setThreshold(String(tConfig.threshold || "0"));
    setFrequency(tConfig.frequency || "always");

    setActionType(rule.actionType);
    const aConfig = rule.actionConfig as any;

    if (rule.actionType === "SEND_NOTIFICATION") {
      setRecipientId(String(aConfig.recipientId || ""));
      setMessageTemplate(aConfig.messageTemplate || "");
    } else {
      setTaskTitle(aConfig.title || "");
      setAssigneeId(String(aConfig.assigneeId || ""));
      setDescription(aConfig.description || "");
      setTaskStatus(aConfig.status || "todo");
      setTaskPriority(aConfig.priority || "medium");
      setDueDate(aConfig.dueDate || "");
    }

    setMode("edit");
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this automation?")) return;
    await deleteAutomationRule(id);
    fetchRules();
  };

  const handleToggle = async (rule: any) => {
    try {
      const newState = !rule.isActive;
      // Optimistic update
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: newState } : r))
      );

      const result = await toggleAutomationRule(rule.id, newState);
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error("Failed to toggle rule", err);
      // Revert on error
      fetchRules();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (actionType === "SEND_NOTIFICATION" && !recipientId) {
      setError("Please select a recipient.");
      setLoading(false);
      return;
    }
    if (actionType === "CREATE_TASK" && !taskTitle) {
      setError("Please enter a task title.");
      setLoading(false);
      return;
    }

    const triggerConfig = {
      viewId: view.viewId || view.id, // Custom View ID
      metric,
      operator,
      threshold: parseFloat(threshold),
      frequency,
      viewType: view.type,
      viewConfig: view.config,
    };

    const actionConfig: any = {};
    if (actionType === "SEND_NOTIFICATION") {
      actionConfig.recipientId = parseInt(recipientId);
      actionConfig.messageTemplate = messageTemplate;
      actionConfig.titleTemplate = `התראה: ${view.ruleName}`;
    } else if (actionType === "CREATE_TASK") {
      actionConfig.title = taskTitle;
      if (assigneeId) actionConfig.assigneeId = parseInt(assigneeId);
      actionConfig.description = description;
      actionConfig.status = taskStatus;
      actionConfig.priority = taskPriority;
      actionConfig.dueDate = dueDate;
    }

    try {
      if (mode === "create") {
        const result = await createAutomationRule({
          name,
          triggerType: "VIEW_METRIC_THRESHOLD",
          triggerConfig,
          actionType,
          actionConfig,
          createdBy: userId,
        });
        if (!result.success) throw new Error(result.error);
      } else {
        // Edit
        if (!editingRuleId) return;
        const result = await updateAutomationRule(editingRuleId, {
          name,
          triggerType: "VIEW_METRIC_THRESHOLD",
          triggerConfig,
          actionType,
          actionConfig,
        });
        if (!result.success) throw new Error(result.error);
      }

      // Success: Go back to list
      setMode("list");
      fetchRules();
    } catch (err: any) {
      setError(err.message || "Failed to save automation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="text-amber-500" size={24} />
              {mode === "list"
                ? "אוטומציות לתצוגה"
                : mode === "edit"
                ? "עריכת אוטומציה"
                : "אוטומציה חדשה"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{view.ruleName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === "list" && (
            <div className="space-y-4">
              {loadingRules ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-blue-500" />
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  אין עדיין אוטומציות לתצוגה זו.
                </div>
              ) : (
                <div className="grid gap-3">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`border rounded-lg p-4 flex justify-between items-center transition-colors ${
                        rule.isActive
                          ? "bg-white border-blue-200 shadow-sm"
                          : "bg-gray-50 border-gray-200 opacity-75"
                      }`}
                    >
                      <div>
                        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                          {rule.isActive ? (
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-gray-400" />
                          )}
                          {rule.name}
                        </h3>
                        <div className="text-xs text-gray-500 mt-1 flex gap-2">
                          <span className="bg-blue-100 text-blue-700 px-1.5 rounded">
                            {rule.actionType === "SEND_NOTIFICATION"
                              ? "התראה"
                              : "משימה"}
                          </span>
                          <span>
                            מתי:{" "}
                            {rule.triggerConfig?.metric === "rawMetric"
                              ? "ערך"
                              : rule.triggerConfig?.metric}{" "}
                            {rule.triggerConfig?.operator === "lt" ? "<" : ">"}{" "}
                            {rule.triggerConfig?.threshold}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => handleToggle(rule)}
                          className={`p-2 rounded-full transition-colors ${
                            rule.isActive
                              ? "text-green-600 hover:bg-green-50"
                              : "text-gray-400 hover:bg-gray-200"
                          }`}
                          title={
                            rule.isActive ? "כבה אוטומציה" : "הפעל אוטומציה"
                          }
                        >
                          <Power size={18} />
                        </button>
                        <div className="h-4 w-[1px] bg-gray-300 mx-1" />
                        <button
                          onClick={() => handleEdit(rule)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"
                          title="ערוך"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-full"
                          title="מחק"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleCreateNew}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 transition-all flex justify-center items-center gap-2 font-medium"
              >
                <Plus size={20} />
                צור אוטומציה חדשה
              </button>
            </div>
          )}

          {(mode === "create" || mode === "edit") && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {mode === "edit" && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-md text-sm mb-4">
                  אתה עורך אוטומציה קיימת. שינויים יישמרו מיידית.
                </div>
              )}

              {/* 1. Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  שם האוטומציה
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="לדוגמה: התראה על ירידה בהמרה"
                  required
                />
              </div>

              {/* Frequency Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  תדירות ביצוע
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full px-3 py-2 border border-blue-200 bg-blue-50/50 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="always">תמיד (בכל פעם שהתנאי מתקיים)</option>
                  <option value="once">
                    פעם אחת (ברגע שהתנאי מתקיים לראשונה)
                  </option>
                  <option value="daily">
                    פעם ביום (מקסימום פעם אחת ב-24 שעות)
                  </option>
                  <option value="weekly">
                    פעם בשבוע (מקסימום פעם אחת ב-7 ימים)
                  </option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  קובע כמה פעמים האוטומציה תפעל אם התנאי ממשיך להתקיים.
                </p>
              </div>

              {/* 2. Trigger */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Zap size={16} className="text-gray-500" />
                  תנאי (Trigger)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      מטריקה
                    </label>
                    <select
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="rawMetric">ערך מוצג (ראשי)</option>
                      {/* Future: Add more sub-metrics if available */}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      אופרטור
                    </label>
                    <select
                      value={operator}
                      onChange={(e) => setOperator(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="lt">קטן מ- (Less Than)</option>
                      <option value="gt">גדול מ- (Greater Than)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      סף (Threshold)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  האוטומציה תפעל כאשר הערך הנוכחי של התצוגה יהיה{" "}
                  {operator === "lt" ? "קטן מ" : "גדול מ"} {threshold}.
                </p>
              </div>

              {/* 3. Action */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <ArrowRight size={16} className="text-blue-500" />
                  פעולה (Action)
                </h3>

                {/* Action Type Selector */}
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="actionType"
                      value="SEND_NOTIFICATION"
                      checked={actionType === "SEND_NOTIFICATION"}
                      onChange={(e) => setActionType(e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm font-medium">שלח התראה</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="actionType"
                      value="CREATE_TASK"
                      checked={actionType === "CREATE_TASK"}
                      onChange={(e) => setActionType(e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm font-medium">צור משימה</span>
                  </label>
                </div>

                {/* Config based on Type */}
                {actionType === "SEND_NOTIFICATION" ? (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        למי לשלוח?
                      </label>
                      <select
                        value={recipientId}
                        onChange={(e) => setRecipientId(e.target.value)}
                        className="w-full px-3 py-2 border border-blue-200 rounded-md text-sm"
                      >
                        <option value="">בחר משתמש...</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        הודעה (תבנית)
                      </label>
                      <textarea
                        value={messageTemplate}
                        onChange={(e) => setMessageTemplate(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-blue-200 rounded-md text-sm"
                        placeholder="Alert: Value is {value}"
                      />
                      <div className="text-[10px] text-gray-400 mt-1 flex gap-2">
                        <span>משתנים זמינים:</span>
                        <code className="bg-white px-1 rounded border border-gray-200">{`{value}`}</code>
                        <code className="bg-white px-1 rounded border border-gray-200">{`{threshold}`}</code>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        כותרת המשימה
                      </label>
                      <input
                        type="text"
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-blue-200 rounded-md text-sm"
                        placeholder="Check metrics..."
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          נציג מטפל
                        </label>
                        <select
                          value={assigneeId}
                          onChange={(e) => setAssigneeId(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-200 rounded-md text-sm"
                        >
                          <option value="">בחר משתמש...</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name || u.email}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          סטטוס
                        </label>
                        <select
                          value={taskStatus}
                          onChange={(e) => setTaskStatus(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-200 rounded-md text-sm"
                        >
                          <option value="todo">לביצוע</option>
                          <option value="in_progress">בטיפול</option>
                          <option value="waiting_client">ממתין ללקוח</option>
                          <option value="done">בוצע</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          עדיפות
                        </label>
                        <select
                          value={taskPriority}
                          onChange={(e) => setTaskPriority(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-200 rounded-md text-sm"
                        >
                          <option value="medium">בינונית</option>
                          <option value="low">נמוכה</option>
                          <option value="high">גבוהה</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          תאריך יעד
                        </label>
                        <input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-200 rounded-md text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        תיאור
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-blue-200 rounded-md text-sm"
                        placeholder="פרטים נוספים למשימה..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {error && <div className="text-red-500 text-sm">{error}</div>}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-between items-center">
          {mode === "list" ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
            >
              סגור
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode("list");
                  setError("");
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
              >
                ביטול וחזרה לרשימה
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <Loader2 className="animate-spin" size={16} />}
                {mode === "edit" ? "שמור שינויים" : "צור אוטומציה"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
