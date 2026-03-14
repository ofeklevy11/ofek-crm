"use client";

import { useEffect, useState } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { getUserFriendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { showConfirm } from "@/hooks/use-modal";
import {
  X,
  Loader2,
  Bell,
  CheckSquare,
  ArrowRight,
  Plus,
  Trash2,
  Edit2,
  Zap,
  Power,
  MessageSquare,
  Pencil,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  Copy,
  Timer,
  Phone,
} from "lucide-react";
import {
  createAutomationRule,
  getViewAutomations,
  deleteAutomationRule,
  updateAutomationRule,
  toggleAutomationRule,
  getAnalyticsAutomationsActionCount,
} from "@/app/actions/automations";
import { getUsers } from "@/app/actions/users";
import { getAllFiles } from "@/app/actions/storage";
import { getTableById, getTablesForUser } from "@/app/actions/tables";
import { AUTOMATION_CATEGORY_LIMITS } from "@/lib/plan-limits";

// Plan limits for analytics automation actions
const PLAN_LIMITS = AUTOMATION_CATEGORY_LIMITS;

const PLAN_LABELS: Record<string, string> = {
  basic: "בייסיק",
  premium: "פרימיום",
  super: "סופר",
};

interface ViewAutomationModalProps {
  view: any;
  onClose: () => void;
  onSuccess?: () => void;
  userId?: number;
  isOpen?: boolean;
  userPlan?: string;
}

export default function ViewAutomationModal({
  view,
  onClose,
  onSuccess,
  userId,
  userPlan = "basic",
}: ViewAutomationModalProps) {
  const focusTrapRef = useFocusTrap(onClose);

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
      const res = await getViewAutomations(view.viewId || view.id);
      if (res.success && res.data) {
        setRules(res.data);
      }
    } catch (e) {
      console.error("Failed to fetch rules", e);
      toast.error(getUserFriendlyError(e));
    } finally {
      setLoadingRules(false);
    }
  };

  // --- Fetch total actions usage ---
  const refreshActionCount = async () => {
    try {
      const res = await getAnalyticsAutomationsActionCount();
      if (res.success) {
        setTotalActionsUsed(res.count);
      }
    } catch (e) {
      console.error("Failed to fetch action count", e);
      toast.error(getUserFriendlyError(e));
    }
  };

  useEffect(() => {
    fetchRules();
  }, [view]);

  // --- Form State (Used for both Create and Edit) ---
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("rawMetric");
  const [operator, setOperator] = useState("lt");
  const [threshold, setThreshold] = useState("0");
  const [frequency, setFrequency] = useState("always");

  // --- Multi-Action State ---
  const [actions, setActions] = useState<{ type: string; config: any }[]>([]);
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [currentActionType, setCurrentActionType] = useState<
    "SEND_NOTIFICATION" | "SEND_WHATSAPP" | "SEND_SMS" | "WEBHOOK" | "CREATE_TASK" | "CALCULATE_DURATION" | "UPDATE_RECORD_FIELD" | ""
  >("");
  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(
    null,
  );

  // Action: Notification (temporary editing state)
  const [recipientId, setRecipientId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");

  // Action: Task (temporary editing state)
  const [taskTitle, setTaskTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [description, setDescription] = useState("");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");

  // Action: WhatsApp (temporary editing state)
  const [waPhoneColumnId, setWaPhoneColumnId] = useState("");
  const [waContent, setWaContent] = useState("");
  const [waMessageType, setWaMessageType] = useState<"private" | "media">(
    "private",
  );
  const [waMediaFileId, setWaMediaFileId] = useState("");
  const [waDelay, setWaDelay] = useState(0);

  // Action: Webhook (temporary editing state)
  const [webhookUrl, setWebhookUrl] = useState("");

  // Action: Update Record Field (temporary editing state)
  const [updateFieldTableId, setUpdateFieldTableId] = useState("");
  const [updateFieldColumnId, setUpdateFieldColumnId] = useState("");
  const [updateFieldValue, setUpdateFieldValue] = useState("");
  const [updateFieldRecordId, setUpdateFieldRecordId] = useState("");
  const [updateFieldColumns, setUpdateFieldColumns] = useState<any[]>([]);
  const [loadingUpdateFieldColumns, setLoadingUpdateFieldColumns] = useState(false);

  const [tables, setTables] = useState<{ id: number; name: string }[]>([]);

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [availableFiles, setAvailableFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Analytics automation limits
  const [totalActionsUsed, setTotalActionsUsed] = useState(0);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [editingOriginalActionsCount, setEditingOriginalActionsCount] =
    useState(0); // Track original actions when editing
  const globalLimit = PLAN_LIMITS[userPlan] ?? 10;

  // When editing, subtract the original actions from totalActionsUsed since they're already in the count
  const effectiveUsed =
    mode === "edit"
      ? totalActionsUsed - editingOriginalActionsCount + actions.length
      : totalActionsUsed;
  const remainingActions =
    userPlan === "super" ? Infinity : Math.max(0, globalLimit - effectiveUsed);
  const isAtLimit = userPlan !== "super" && effectiveUsed >= globalLimit;

  // Local max actions per automation (can be up to 4, but limited by remaining)
  const maxActions =
    userPlan === "super" ? 4 : Math.min(4, remainingActions + actions.length);

  useEffect(() => {
    getUsers().then((res) => {
      if (res.success && res.data) {
        setUsers(res.data);
      }
    });
    getTablesForUser().then((res) => {
      if (res.success && res.data) {
        setTables(res.data.map((t: any) => ({ id: t.id, name: t.name })));
      }
    });
  }, []);

  // Load columns for UPDATE_RECORD_FIELD action when its table changes
  useEffect(() => {
    if (!updateFieldTableId) {
      setUpdateFieldColumns([]);
      return;
    }
    setLoadingUpdateFieldColumns(true);
    getTableById(Number(updateFieldTableId))
      .then((res) => {
        if (res.success && res.data && res.data.schemaJson) {
          const schema = res.data.schemaJson as any;
          let cols: any[] = [];
          if (Array.isArray(schema)) {
            cols = schema;
          } else if (schema && Array.isArray(schema.columns)) {
            cols = schema.columns;
          }
          setUpdateFieldColumns(cols);
        }
      })
      .finally(() => setLoadingUpdateFieldColumns(false));
  }, [updateFieldTableId]);

  // Fetch total actions usage across all analytics automations - only once on mount
  useEffect(() => {
    setLoadingUsage(true);
    refreshActionCount().finally(() => setLoadingUsage(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load files when WhatsApp media is selected
  useEffect(() => {
    if (waMessageType === "media") {
      setLoadingFiles(true);
      getAllFiles()
        .then((files) => {
          setAvailableFiles(files);
        })
        .finally(() => setLoadingFiles(false));
    }
  }, [waMessageType]);

  // --- Action Management ---
  const resetActionFields = () => {
    setCurrentActionType("");
    setRecipientId("");
    setMessageTemplate("");
    setTaskTitle("");
    setAssigneeId("");
    setDescription("");
    setTaskStatus("todo");
    setTaskPriority("medium");
    setDueDate("");
    setWaPhoneColumnId("");
    setWaContent("");
    setWaMessageType("private");
    setWaMediaFileId("");
    setWaDelay(0);
    setWebhookUrl("");
    setUpdateFieldTableId("");
    setUpdateFieldColumnId("");
    setUpdateFieldValue("");
    setUpdateFieldRecordId("");
  };

  const validateCurrentAction = () => {
    if (!currentActionType) return false;
    if (currentActionType === "SEND_NOTIFICATION")
      return !!recipientId && !!messageTemplate;
    if (currentActionType === "SEND_WHATSAPP" || currentActionType === "SEND_SMS") {
      // Check actual phone number, not just the "manual:" prefix
      const actualPhone = waPhoneColumnId.replace("manual:", "").trim();
      if (!actualPhone) return false;
      if (!waContent) return false;
      if (waMessageType === "media" && !waMediaFileId) return false;
      const waBeforeCount =
        editingActionIndex !== null
          ? actions.filter(
              (a, i) => (a.type === "SEND_WHATSAPP" || a.type === "SEND_SMS") && i < editingActionIndex,
            ).length
          : actions.filter((a) => a.type === "SEND_WHATSAPP" || a.type === "SEND_SMS").length;
      if (waBeforeCount > 0) {
        const minDelay = waBeforeCount >= 2 ? 20 : 10;
        if (!waDelay || waDelay < minDelay) return false;
      }
      return true;
    }
    if (currentActionType === "WEBHOOK") {
      return !!webhookUrl && webhookUrl.startsWith("http");
    }
    if (currentActionType === "CREATE_TASK") {
      return !!taskTitle;
    }
    if (currentActionType === "CALCULATE_DURATION") return true;
    if (currentActionType === "UPDATE_RECORD_FIELD") {
      return !!updateFieldTableId && !!updateFieldColumnId && !!updateFieldValue && !!updateFieldRecordId;
    }
    return false;
  };

  const handleConfirmAction = () => {
    if (!validateCurrentAction()) return;

    const newActionConfig: any =
      currentActionType === "WEBHOOK"
        ? { webhookUrl }
        : currentActionType === "SEND_NOTIFICATION"
          ? {
              recipientId: parseInt(recipientId),
              messageTemplate,
              titleTemplate: `התראה: ${view.ruleName}`,
            }
          : currentActionType === "SEND_WHATSAPP" || currentActionType === "SEND_SMS"
            ? {
                phoneColumnId: waPhoneColumnId,
                messageType: waMessageType,
                content: waContent,
                mediaFileId: waMediaFileId ? Number(waMediaFileId) : null,
                delay: waDelay,
              }
            : currentActionType === "CREATE_TASK"
              ? {
                  title: taskTitle,
                  description,
                  status: taskStatus,
                  priority: taskPriority,
                  assigneeId: assigneeId ? Number(assigneeId) : null,
                  dueDate,
                }
              : currentActionType === "UPDATE_RECORD_FIELD"
                ? {
                    tableId: updateFieldTableId,
                    columnId: updateFieldColumnId,
                    value: updateFieldValue,
                    recordId: updateFieldRecordId,
                  }
                : {};

    const actionObj = { type: currentActionType, config: newActionConfig };

    if (editingActionIndex !== null) {
      const newActions = [...actions];
      newActions[editingActionIndex] = actionObj;
      setActions(newActions);
      setEditingActionIndex(null);
    } else {
      setActions([...actions, actionObj]);
    }

    setIsAddingAction(false);
    resetActionFields();
  };

  const removeAction = (index: number) => {
    const newActions = [...actions];
    newActions.splice(index, 1);
    setActions(newActions);
  };

  const editAction = (index: number) => {
    const action = actions[index];
    setCurrentActionType(action.type as any);

    if (action.type === "SEND_NOTIFICATION") {
      setRecipientId(action.config.recipientId?.toString() || "");
      setMessageTemplate(action.config.messageTemplate || "");
    } else if (action.type === "SEND_WHATSAPP" || action.type === "SEND_SMS") {
      setWaPhoneColumnId(action.config.phoneColumnId || "");
      setWaMessageType(action.config.messageType || "private");
      setWaContent(action.config.content || "");
      setWaMediaFileId(action.config.mediaFileId?.toString() || "");
      setWaDelay(action.config.delay || 0);
    } else if (action.type === "WEBHOOK") {
      setWebhookUrl(action.config.webhookUrl || "");
    } else if (action.type === "CREATE_TASK") {
      setTaskTitle(action.config.title || "");
      setAssigneeId(action.config.assigneeId?.toString() || "");
      setDescription(action.config.description || "");
      setTaskStatus(action.config.status || "todo");
      setTaskPriority(action.config.priority || "medium");
      setDueDate(action.config.dueDate || "");
    } else if (action.type === "UPDATE_RECORD_FIELD") {
      setUpdateFieldTableId(action.config.tableId || "");
      setUpdateFieldColumnId(action.config.columnId || "");
      setUpdateFieldValue(action.config.value || "");
      setUpdateFieldRecordId(action.config.recordId || "");
    }
    // CALCULATE_DURATION has no config to load

    setEditingActionIndex(index);
    setIsAddingAction(true);
  };

  // --- Handlers ---

  const handleCreateNew = () => {
    setName(`Automation for ${view.ruleName}`);
    setMetric("rawMetric");
    setOperator("lt");
    setThreshold("10");
    setFrequency("always");
    setActions([]);
    setEditingOriginalActionsCount(0); // Reset for new automation
    setIsAddingAction(true);
    resetActionFields();
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

    // Parse actions and remember original count
    let originalActions: any[] = [];
    if (rule.actionType === "MULTI_ACTION") {
      originalActions = rule.actionConfig?.actions || [];
    } else if (rule.actionType) {
      originalActions = [
        { type: rule.actionType, config: rule.actionConfig || {} },
      ];
    }
    setActions(originalActions);
    setEditingOriginalActionsCount(originalActions.length); // Remember for limit calculation
    setIsAddingAction(false);
    resetActionFields();

    setMode("edit");
  };

  const handleDelete = async (id: number) => {
    if (!(await showConfirm({ message: "האם אתה בטוח שברצונך למחוק אוטומציה זו?", variant: "destructive" }))) return;
    try {
      await deleteAutomationRule(id);
      toast.success("האוטומציה נמחקה בהצלחה");
      fetchRules();
      refreshActionCount();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    }
  };

  const handleToggle = async (rule: any) => {
    try {
      const newState = !rule.isActive;
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: newState } : r)),
      );
      const result = await toggleAutomationRule(rule.id, newState);
      if (!result.success) {
        throw new Error(result.error);
      }
      toast.success(newState ? "האוטומציה הופעלה" : "האוטומציה הושבתה");
    } catch (err) {
      toast.error(getUserFriendlyError(err));
      fetchRules();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError("");
    setLoading(true);

    if (actions.length === 0) {
      setError("נא להוסיף לפחות פעולה אחת.");
      setLoading(false);
      return;
    }

    const triggerConfig = {
      viewId: view.viewId || view.id,
      metric,
      operator,
      threshold: parseFloat(threshold),
      frequency,
      viewType: view.type,
      viewConfig: view.config,
    };

    // Build final action payload
    let finalActionType = "";
    let finalActionConfig: any = {};

    if (actions.length > 1) {
      finalActionType = "MULTI_ACTION";
      finalActionConfig = { actions };
    } else {
      finalActionType = actions[0].type;
      finalActionConfig = actions[0].config;
    }

    try {
      if (mode === "create") {
        const result = await createAutomationRule({
          name,
          triggerType: "VIEW_METRIC_THRESHOLD",
          triggerConfig,
          actionType: finalActionType,
          actionConfig: finalActionConfig,
          source: "ANALYTICS_VIEW",
        });
        if (!result.success) throw new Error(result.error);
        toast.success("האוטומציה נוצרה בהצלחה");
      } else {
        if (!editingRuleId) return;
        const result = await updateAutomationRule(editingRuleId, {
          name,
          triggerType: "VIEW_METRIC_THRESHOLD",
          triggerConfig,
          actionType: finalActionType,
          actionConfig: finalActionConfig,
        });
        if (!result.success) throw new Error(result.error);
        toast.success("האוטומציה עודכנה בהצלחה");
      }

      setMode("list");
      fetchRules();
      refreshActionCount();
    } catch (err: any) {
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  // --- Action type display helpers ---
  const getActionIcon = (type: string) => {
    switch (type) {
      case "SEND_NOTIFICATION":
        return <Bell size={20} />;
      case "SEND_WHATSAPP":
        return <MessageSquare size={20} />;
      case "SEND_SMS":
        return <Phone size={20} />;
      case "WEBHOOK":
        return <div className="font-bold text-xs">API</div>;
      case "CREATE_TASK":
        return <CheckSquare size={20} />;
      case "CALCULATE_DURATION":
        return <Timer size={20} />;
      case "UPDATE_RECORD_FIELD":
        return <Pencil size={20} />;
      default:
        return <Zap size={20} />;
    }
  };

  const getActionName = (type: string) => {
    switch (type) {
      case "SEND_NOTIFICATION":
        return "שליחת התראה";
      case "SEND_WHATSAPP":
        return "שליחת WhatsApp";
      case "SEND_SMS":
        return "שליחת SMS";
      case "WEBHOOK":
        return "Webhook";
      case "CREATE_TASK":
        return "יצירת משימה";
      case "CALCULATE_DURATION":
        return "חישוב זמן";
      case "UPDATE_RECORD_FIELD":
        return "עדכון שדה ברשומה";
      default:
        return type;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="automation-modal-title" onClick={onClose}>
      <div
        ref={focusTrapRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <div>
            <h2 id="automation-modal-title" className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="text-amber-500" size={24} />
              {mode === "list"
                ? "אוטומציות לאנליטיקה"
                : mode === "edit"
                  ? "עריכת אוטומציה"
                  : "אוטומציה חדשה"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{view.ruleName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
            aria-label="סגור"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === "list" && (
            <div className="space-y-4">
              {/* Plan Usage Disclaimer */}
              {!loadingUsage && (
                <div
                  className={`p-4 rounded-xl border ${
                    isAtLimit
                      ? "bg-red-50 border-red-200"
                      : userPlan === "super"
                        ? "bg-green-50 border-green-200"
                        : "bg-blue-50 border-blue-200"
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        isAtLimit
                          ? "bg-red-100 text-red-600"
                          : userPlan === "super"
                            ? "bg-green-100 text-green-600"
                            : "bg-blue-100 text-blue-600"
                      }`}
                    >
                      <AlertCircle size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">
                        תוכנית: {PLAN_LABELS[userPlan] || userPlan}
                      </div>
                      {userPlan === "super" ? (
                        <p className="text-sm text-green-700 mt-1">
                          ללא הגבלה על מספר פעולות האוטומציה.
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-600 mt-1">
                            {isAtLimit
                              ? `הגעת למגבלת הפעולות (${globalLimit}). שדרג את התוכנית להוספת פעולות נוספות.`
                              : `${totalActionsUsed} מתוך ${globalLimit} פעולות בשימוש. נשארו ${remainingActions} פעולות.`}
                          </p>
                          {/* Progress bar */}
                          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow={totalActionsUsed} aria-valuemax={globalLimit} aria-label="שימוש בפעולות אוטומציה">
                            <div
                              className={`h-full transition-all ${
                                isAtLimit ? "bg-red-500" : "bg-blue-500"
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  (totalActionsUsed / globalLimit) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                          {/* Clarifying note */}
                          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                            <span className="inline-block w-1 h-1 bg-gray-400 rounded-full"></span>
                            הספירה כוללת את כל פעולות האוטומציה מכל האנליטיקות
                            ביחד
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
                        <div className="text-xs text-gray-500 mt-1 flex gap-2 flex-wrap">
                          <span className="bg-blue-100 text-blue-700 px-1.5 rounded">
                            {rule.actionType === "MULTI_ACTION"
                              ? `${rule.actionConfig?.actions?.length || 0} פעולות`
                              : getActionName(rule.actionType)}
                          </span>
                          <span>
                            מתי:{" "}
                            {rule.triggerConfig?.metric === "rawMetric"
                              ? "ערך"
                              : rule.triggerConfig?.metric}{" "}
                            {{
                              lt: "<",
                              lte: "≤",
                              gt: ">",
                              gte: "≥",
                              eq: "=",
                              neq: "≠",
                            }[rule.triggerConfig?.operator as string] ||
                              rule.triggerConfig?.operator}{" "}
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
                          aria-label={rule.isActive ? "כבה אוטומציה" : "הפעל אוטומציה"}
                        >
                          <Power size={18} />
                        </button>
                        <div className="h-4 w-px bg-gray-300 mx-1" aria-hidden="true" />
                        <button
                          onClick={() => handleEdit(rule)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"
                          title="ערוך"
                          aria-label="ערוך"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-full"
                          title="מחק"
                          aria-label="מחק"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Create New Button - disabled if at limit */}
              {isAtLimit ? (
                <div className="w-full py-3 border-2 border-dashed border-red-200 rounded-lg text-red-400 bg-red-50/50 flex justify-center items-center gap-2 font-medium cursor-not-allowed">
                  <AlertCircle size={20} />
                  הגעת למגבלה - שדרג תוכנית להוספת אוטומציות
                </div>
              ) : (
                <button
                  onClick={handleCreateNew}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 transition-all flex justify-center items-center gap-2 font-medium"
                >
                  <Plus size={20} />
                  צור אוטומציה חדשה
                </button>
              )}
            </div>
          )}

          {(mode === "create" || mode === "edit") && (
            <div className="space-y-6">
              {/* Plan Usage Banner */}
              {userPlan !== "super" && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="font-medium">
                      תוכנית {PLAN_LABELS[userPlan]}:
                    </span>
                    <span>
                      {effectiveUsed} / {globalLimit} פעולות
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
                    {remainingActions === Infinity
                      ? "ללא הגבלה"
                      : `נותרו ${Math.floor(remainingActions)} פעולות`}
                  </div>
                </div>
              )}

              {mode === "edit" && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-md text-sm mb-4">
                  אתה עורך אוטומציה קיימת. שינויים יישמרו מיידית.
                </div>
              )}

              {/* 1. Name */}
              <div>
                <label htmlFor="automation-name" className="block text-sm font-medium text-gray-700 mb-1">
                  שם האוטומציה
                </label>
                <input
                  id="automation-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="לדוגמה: התראה על ירידה בהמרה"
                  required
                />
              </div>

              {/* Frequency Selection */}
              <div>
                <label htmlFor="automation-frequency" className="block text-sm font-medium text-gray-700 mb-1">
                  תדירות ביצוע
                </label>
                <select
                  id="automation-frequency"
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
                {frequency === "always" && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="text-sm text-blue-700">
                      באוטומציה זו, הפעולה תתבצע רק אם הנתונים השתנו מאז הבדיקה
                      האחרונה. אם הנתונים זהים (אותה כמות רשומות, אותם אחוזי
                      המרה וכו׳) - האוטומציה לא תפעל גם אם התנאי עדיין מתקיים.
                    </p>
                  </div>
                )}
              </div>

              {/* 2. Trigger */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Zap size={16} className="text-amber-500" />
                  תנאי (Trigger)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="automation-metric" className="block text-xs font-medium text-gray-500 mb-1">
                      מטריקה
                    </label>
                    <select
                      id="automation-metric"
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                      className="w-full appearance-none pr-3 pl-10 py-2 border border-gray-300 rounded-md text-sm"
                      style={{
                        backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "left 12px center",
                        backgroundSize: "12px",
                      }}
                    >
                      <option value="rawMetric">ערך מוצג (ראשי)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="automation-operator" className="block text-xs font-medium text-gray-500 mb-1">
                      אופרטור
                    </label>
                    <select
                      id="automation-operator"
                      value={operator}
                      onChange={(e) => setOperator(e.target.value)}
                      className="w-full appearance-none pr-3 pl-10 py-2 border border-gray-300 rounded-md text-sm"
                      style={{
                        backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "left 12px center",
                        backgroundSize: "12px",
                      }}
                    >
                      <option value="lt">&lt; קטן מ-</option>
                      <option value="lte">&le; קטן או שווה ל-</option>
                      <option value="gt">&gt; גדול מ-</option>
                      <option value="gte">&ge; גדול או שווה ל-</option>
                      <option value="eq">= שווה ל-</option>
                      <option value="neq">&ne; שונה מ-</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="automation-threshold" className="block text-xs font-medium text-gray-500 mb-1">
                      סף (Threshold)
                    </label>
                    <input
                      id="automation-threshold"
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
                  {{
                    lt: "קטן מ",
                    lte: "קטן או שווה ל",
                    gt: "גדול מ",
                    gte: "גדול או שווה ל",
                    eq: "שווה ל",
                    neq: "שונה מ",
                  }[operator] || operator}{" "}
                  {threshold}.
                </p>
              </div>

              {/* 3. Actions - Game-like UI */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <ArrowRight size={16} className="text-blue-500" />
                    פעולות (Actions)
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">
                      {actions.length}/{maxActions}
                    </div>
                    {userPlan !== "super" && (
                      <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        נשארו {remainingActions} פעולות
                      </div>
                    )}
                  </div>
                </div>

                {/* List of Configured Actions */}
                {actions.length > 0 && (
                  <div className="space-y-3">
                    {actions.map((act, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            {getActionIcon(act.type)}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {getActionName(act.type)}
                            </div>
                            <div className="text-xs text-gray-500">
                              פעולה #{idx + 1}
                            </div>
                          </div>
                        </div>
                        {!isAddingAction && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => editAction(idx)}
                              className="text-blue-500 hover:text-blue-700 p-2 hover:bg-blue-50 rounded-full transition-colors"
                              title="ערוך פעולה"
                              aria-label="ערוך פעולה"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={() => removeAction(idx)}
                              className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors"
                              title="מחק פעולה"
                              aria-label="מחק פעולה"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Action Section */}
                {isAddingAction ? (
                  <div className="border-t border-blue-100 pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-medium text-gray-800">
                        {editingActionIndex !== null
                          ? `עריכת פעולה #${editingActionIndex + 1}`
                          : `הוספת פעולה חדשה (${actions.length + 1}/${maxActions})`}
                      </h4>
                      {actions.length > 0 && (
                        <button
                          onClick={() => {
                            setIsAddingAction(false);
                            setEditingActionIndex(null);
                            resetActionFields();
                          }}
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          ביטול
                        </button>
                      )}
                    </div>

                    {/* Action Type Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <ActionCard
                        title="שליחת התראה"
                        description="שלח הודעה למערכת"
                        icon={<Bell className="text-yellow-500" size={24} />}
                        selected={currentActionType === "SEND_NOTIFICATION"}
                        onClick={() =>
                          setCurrentActionType("SEND_NOTIFICATION")
                        }
                      />
                      <ActionCard
                        title="שליחת WhatsApp"
                        description="שלח הודעה דרך Green API"
                        icon={
                          <MessageSquare className="text-green-600" size={24} />
                        }
                        selected={currentActionType === "SEND_WHATSAPP"}
                        onClick={() => setCurrentActionType("SEND_WHATSAPP")}
                      />
                      <ActionCard
                        title="שליחת SMS"
                        description="שלח הודעת SMS לנמען"
                        icon={
                          <Phone className="text-blue-600" size={24} />
                        }
                        selected={currentActionType === "SEND_SMS"}
                        onClick={() => setCurrentActionType("SEND_SMS")}
                      />
                      <ActionCard
                        title="Webhook"
                        description="שלח נתונים למערכת חיצונית"
                        icon={
                          <div className="font-bold text-gray-600 text-lg">
                            Api
                          </div>
                        }
                        selected={currentActionType === "WEBHOOK"}
                        onClick={() => setCurrentActionType("WEBHOOK")}
                      />
                      <ActionCard
                        title="יצירת משימה"
                        description="צור משימה חדשה אוטומטית"
                        icon={
                          <CheckSquare className="text-blue-500" size={24} />
                        }
                        selected={currentActionType === "CREATE_TASK"}
                        onClick={() => setCurrentActionType("CREATE_TASK")}
                      />
                      <ActionCard
                        title="חישוב זמן"
                        description="חשב ושמור את זמן השהייה בסטטוס"
                        icon={
                          <Timer className="text-teal-500" size={24} />
                        }
                        selected={currentActionType === "CALCULATE_DURATION"}
                        onClick={() => setCurrentActionType("CALCULATE_DURATION")}
                      />
                      <ActionCard
                        title="עדכון שדה ברשומה"
                        description="עדכן ערך בשדה מסוים ברשומה"
                        icon={
                          <Pencil className="text-purple-500" size={24} />
                        }
                        selected={currentActionType === "UPDATE_RECORD_FIELD"}
                        onClick={() => setCurrentActionType("UPDATE_RECORD_FIELD")}
                      />
                    </div>

                    {/* Action Config Forms */}
                    {currentActionType === "SEND_NOTIFICATION" && (
                      <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 space-y-4 animate-in slide-in-from-top-2">
                        <div>
                          <label htmlFor="automation-recipient" className="block text-sm font-medium text-gray-700 mb-1">
                            למי לשלוח?
                          </label>
                          <select
                            id="automation-recipient"
                            value={recipientId}
                            onChange={(e) => setRecipientId(e.target.value)}
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
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
                          <label htmlFor="automation-message-template" className="block text-sm font-medium text-gray-700 mb-1">
                            הודעה (תבנית)
                          </label>
                          <textarea
                            id="automation-message-template"
                            value={messageTemplate}
                            onChange={(e) => setMessageTemplate(e.target.value)}
                            rows={2}
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                            placeholder="Alert: Value is {value}"
                          />
                          <div className="text-[10px] text-gray-400 mt-1 flex gap-2">
                            <span>משתנים זמינים:</span>
                            <code className="bg-white px-1 rounded border border-gray-200">{`{value}`}</code>
                            <code className="bg-white px-1 rounded border border-gray-200">{`{threshold}`}</code>
                          </div>
                        </div>
                      </div>
                    )}

                    {(currentActionType === "SEND_WHATSAPP" || currentActionType === "SEND_SMS") && (
                      <div className={`${currentActionType === "SEND_SMS" ? "bg-blue-50" : "bg-green-50"} p-6 rounded-xl border ${currentActionType === "SEND_SMS" ? "border-blue-100" : "border-green-100"} space-y-5 animate-in slide-in-from-top-2`}>
                        <div className={`flex items-center gap-2 mb-2 ${currentActionType === "SEND_SMS" ? "text-blue-800" : "text-green-800"} font-medium pb-2 border-b ${currentActionType === "SEND_SMS" ? "border-blue-200" : "border-green-200"}`}>
                          {currentActionType === "SEND_SMS" ? <Phone size={18} /> : <MessageSquare size={18} />}
                          {currentActionType === "SEND_SMS" ? "הגדרות הודעת SMS" : "הגדרות הודעת WhatsApp"}
                        </div>

                        {/* Phone number - manual only for analytics (no table context) */}
                        <div>
                          <label htmlFor="automation-wa-phone" className="block text-sm font-medium text-gray-700 mb-2">
                            מספר טלפון לשליחה
                          </label>
                          <input
                            id="automation-wa-phone"
                            type="text"
                            value={waPhoneColumnId.replace("manual:", "")}
                            onChange={(e) =>
                              setWaPhoneColumnId(`manual:${e.target.value}`)
                            }
                            placeholder="הכנס מספר טלפון (לדוגמה: 0501234567)"
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500"
                            dir="ltr"
                          />
                          {currentActionType === "SEND_WHATSAPP" && waPhoneColumnId.replace("manual:", "") && (
                            <div className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                              <strong>תצוגה מקדימה לשליחה:</strong>{" "}
                              <span dir="ltr" className="font-mono">
                                {formatPhonePreview(
                                  waPhoneColumnId.replace("manual:", ""),
                                )}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Delay Logic */}
                        {(() => {
                          const waBeforeCount =
                            editingActionIndex !== null
                              ? actions.filter(
                                  (a, i) =>
                                    (a.type === "SEND_WHATSAPP" || a.type === "SEND_SMS") &&
                                    i < editingActionIndex,
                                ).length
                              : actions.filter(
                                  (a) => a.type === "SEND_WHATSAPP" || a.type === "SEND_SMS",
                                ).length;

                          if (waBeforeCount > 0) {
                            const minDelay = waBeforeCount >= 2 ? 20 : 10;
                            return (
                              <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 animate-in slide-in-from-top-2">
                                <label htmlFor="automation-wa-delay" className="flex items-center gap-2 text-orange-800 font-medium mb-2">
                                  <Clock size={16} />
                                  השהייה לפני שליחה (בשניות)
                                </label>
                                <p className="text-xs text-orange-600 mb-3">
                                  נא להגדיר השהייה של לפחות {minDelay} שניות כדי
                                  למנוע חסימה ע"י Green API.
                                </p>
                                <input
                                  id="automation-wa-delay"
                                  type="number"
                                  min={minDelay}
                                  value={waDelay}
                                  onChange={(e) =>
                                    setWaDelay(parseInt(e.target.value) || 0)
                                  }
                                  className={`w-full px-4 py-2 bg-white border rounded-lg shadow-sm ${waDelay < minDelay ? "border-red-500 ring-1 ring-red-500" : "border-orange-200"}`}
                                />
                                {waDelay < minDelay && (
                                  <p className="text-xs text-red-500 mt-1" role="alert">
                                    הערך נמוך מהמינימום הנדרש ({minDelay})
                                  </p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Message Type */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            סוג הודעה
                          </label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors flex-1">
                              <input
                                type="radio"
                                name="waMessageType"
                                value="private"
                                checked={waMessageType === "private"}
                                onChange={() => setWaMessageType("private")}
                                className="text-green-600 focus:ring-green-500"
                              />
                              <span className="font-medium text-gray-700">
                                הודעה רגילה
                              </span>
                            </label>
                            <label className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors flex-1">
                              <input
                                type="radio"
                                name="waMessageType"
                                value="media"
                                checked={waMessageType === "media"}
                                onChange={() => setWaMessageType("media")}
                                className="text-green-600 focus:ring-green-500"
                              />
                              <span className="font-medium text-gray-700">
                                הודעה עם מדיה
                              </span>
                            </label>
                          </div>
                        </div>

                        {/* Media Selection */}
                        {waMessageType === "media" && (
                          <div className="animate-in slide-in-from-top-2">
                            <label htmlFor="automation-wa-media" className="block text-sm font-medium text-gray-700 mb-1">
                              בחר קובץ לשליחה
                            </label>
                            {loadingFiles ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                                <Loader2 className="animate-spin" size={16} />{" "}
                                טוען קבצים...
                              </div>
                            ) : (
                              <select
                                id="automation-wa-media"
                                value={waMediaFileId}
                                onChange={(e) =>
                                  setWaMediaFileId(e.target.value)
                                }
                                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                              >
                                <option value="">בחר קובץ מהמערכת...</option>
                                {availableFiles.map((file) => (
                                  <option key={file.id} value={file.id}>
                                    {file.name} ({file.type})
                                  </option>
                                ))}
                              </select>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              הקובץ יישלח כקובץ מצורף יחד עם ההודעה.
                            </p>
                          </div>
                        )}

                        {/* Content */}
                        <div>
                          <label htmlFor="automation-wa-content" className="block text-sm font-medium text-gray-700 mb-1">
                            {waMessageType === "media"
                              ? "כיתוב (Caption)"
                              : "תוכן ההודעה"}
                          </label>
                          <textarea
                            id="automation-wa-content"
                            value={waContent}
                            onChange={(e) => setWaContent(e.target.value)}
                            rows={4}
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                            placeholder="הקלד את ההודעה כאן..."
                          />
                          <div className="text-[10px] text-gray-400 mt-1 flex gap-2">
                            <span>משתנים זמינים:</span>
                            <code className="bg-white px-1 rounded border border-gray-200">{`{value}`}</code>
                            <code className="bg-white px-1 rounded border border-gray-200">{`{threshold}`}</code>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentActionType === "WEBHOOK" && (
                      <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 space-y-5 animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 mb-2 text-gray-800 font-medium pb-2 border-b border-gray-200">
                          Webhook Configuration
                        </div>
                        <div>
                          <label htmlFor="automation-webhook-url" className="block text-sm font-medium text-gray-700 mb-2">
                            כתובת ה-URL לשליחה (POST)
                          </label>
                          <input
                            id="automation-webhook-url"
                            type="url"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            placeholder="https://api.example.com/webhook"
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm font-mono text-sm"
                            dir="ltr"
                          />
                          <p className="text-xs text-gray-500 mt-2">
                            המערכת תשלח בקשת POST לכתובת זו עם כל הנתונים
                            הרלוונטיים (JSON).
                          </p>
                        </div>
                      </div>
                    )}

                    {currentActionType === "CREATE_TASK" && (
                      <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 space-y-5 animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 mb-2 text-blue-800 font-medium pb-2 border-b border-blue-200">
                          <CheckSquare size={18} />
                          הגדרות משימה חדשה
                        </div>

                        <div>
                          <label htmlFor="automation-task-title" className="block text-sm font-medium text-gray-700 mb-1">
                            כותרת המשימה
                          </label>
                          <input
                            id="automation-task-title"
                            type="text"
                            value={taskTitle}
                            onChange={(e) => setTaskTitle(e.target.value)}
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            placeholder="לדוגמה: לבדוק את הנתונים"
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="automation-task-description" className="block text-sm font-medium text-gray-700 mb-1">
                            תיאור
                          </label>
                          <textarea
                            id="automation-task-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            rows={3}
                            placeholder="פרטים נוספים למשימה..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="automation-assignee" className="block text-sm font-medium text-gray-700 mb-1">
                              נציג מטפל
                            </label>
                            <select
                              id="automation-assignee"
                              value={assigneeId}
                              onChange={(e) => setAssigneeId(e.target.value)}
                              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
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
                            <label htmlFor="automation-task-status" className="block text-sm font-medium text-gray-700 mb-1">
                              סטטוס
                            </label>
                            <select
                              id="automation-task-status"
                              value={taskStatus}
                              onChange={(e) => setTaskStatus(e.target.value)}
                              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                            >
                              <option value="todo">משימות</option>
                              <option value="in_progress">משימות בטיפול</option>
                              <option value="waiting_client">ממתינים לאישור לקוח</option>
                              <option value="on_hold">משימות בהשהייה</option>
                              <option value="completed_month">בוצעו החודש</option>
                              <option value="done">משימות שבוצעו</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="automation-task-priority" className="block text-sm font-medium text-gray-700 mb-1">
                              עדיפות
                            </label>
                            <select
                              id="automation-task-priority"
                              value={taskPriority}
                              onChange={(e) => setTaskPriority(e.target.value)}
                              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                            >
                              <option value="low">נמוכה</option>
                              <option value="medium">בינונית</option>
                              <option value="high">גבוהה</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor="automation-due-date" className="block text-sm font-medium text-gray-700 mb-1">
                              תאריך יעד
                            </label>
                            <input
                              id="automation-due-date"
                              type="date"
                              value={dueDate}
                              onChange={(e) => setDueDate(e.target.value)}
                              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {currentActionType === "CALCULATE_DURATION" && (
                      <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 text-sm text-teal-800 animate-in slide-in-from-top-2">
                        <p className="font-semibold mb-1">איך זה עובד?</p>
                        המערכת תחשב אוטומטית את הזמן שעבר בין השינוי האחרון לשינוי הנוכחי
                        ותשמור אותו בדוח ביצועים. אין צורך בהגדרות נוספות.
                      </div>
                    )}

                    {currentActionType === "UPDATE_RECORD_FIELD" && (
                      <div className="bg-purple-50 p-6 rounded-xl border border-purple-100 space-y-5 animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 mb-2 text-purple-800 font-medium pb-2 border-b border-purple-200">
                          <Pencil size={18} />
                          עדכון שדה ברשומה
                        </div>

                        <div className="bg-purple-100/50 p-3 rounded-lg text-sm text-purple-700">
                          <strong>שים לב:</strong> כאשר האוטומציה תפעל, השדה שתבחר יעודכן
                          אוטומטית לערך שתגדיר.
                        </div>

                        <div>
                          <label htmlFor="automation-update-table" className="block text-sm font-medium text-gray-700 mb-1">
                            בחר טבלה
                          </label>
                          <select
                            id="automation-update-table"
                            required
                            value={updateFieldTableId}
                            onChange={(e) => {
                              setUpdateFieldTableId(e.target.value);
                              setUpdateFieldColumnId("");
                              setUpdateFieldValue("");
                            }}
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                          >
                            <option value="">בחר טבלה...</option>
                            {tables.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {updateFieldTableId && (
                          <div>
                            <label htmlFor="automation-update-column" className="block text-sm font-medium text-gray-700 mb-1">
                              בחר שדה לעדכון
                            </label>
                            {loadingUpdateFieldColumns ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                                <Loader2 className="animate-spin" size={16} /> טוען עמודות...
                              </div>
                            ) : (
                              <select
                                id="automation-update-column"
                                required
                                value={updateFieldColumnId}
                                onChange={(e) => {
                                  setUpdateFieldColumnId(e.target.value);
                                  setUpdateFieldValue("");
                                }}
                                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                              >
                                <option value="">בחר עמודה...</option>
                                {updateFieldColumns.map((col: any) => (
                                  <option key={col.id || col.name} value={col.name}>
                                    {col.label || col.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        {updateFieldColumnId && (
                          <div>
                            <label htmlFor="automation-update-value" className="block text-sm font-medium text-gray-700 mb-1">
                              הערך החדש
                            </label>
                            {(() => {
                              const selectedCol = updateFieldColumns.find(
                                (c: any) =>
                                  c.id === updateFieldColumnId ||
                                  c.name === updateFieldColumnId,
                              );
                              const isSelectType =
                                selectedCol &&
                                (selectedCol.type === "select" ||
                                  selectedCol.type === "multiSelect" ||
                                  selectedCol.type === "status" ||
                                  selectedCol.type === "priority");

                              if (isSelectType && selectedCol?.options) {
                                return (
                                  <select
                                    id="automation-update-value"
                                    required
                                    value={updateFieldValue}
                                    onChange={(e) => setUpdateFieldValue(e.target.value)}
                                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                  >
                                    <option value="">בחר ערך...</option>
                                    {selectedCol.options.map((opt: any, i: number) => (
                                      <option key={i} value={typeof opt === "string" ? opt : opt.value || opt.label}>
                                        {typeof opt === "string" ? opt : opt.label || opt.value}
                                      </option>
                                    ))}
                                  </select>
                                );
                              }

                              if (selectedCol?.type === "boolean" || selectedCol?.type === "checkbox") {
                                return (
                                  <select
                                    id="automation-update-value"
                                    required
                                    value={updateFieldValue}
                                    onChange={(e) => setUpdateFieldValue(e.target.value)}
                                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                  >
                                    <option value="false">לא / כבוי</option>
                                    <option value="true">כן / פעיל</option>
                                  </select>
                                );
                              }

                              if (selectedCol?.type === "date") {
                                return (
                                  <input
                                    id="automation-update-value"
                                    required
                                    type="date"
                                    value={updateFieldValue}
                                    onChange={(e) => setUpdateFieldValue(e.target.value)}
                                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                  />
                                );
                              }

                              return (
                                <input
                                  id="automation-update-value"
                                  required
                                  type={selectedCol?.type === "number" || selectedCol?.type === "currency" ? "number" : "text"}
                                  value={updateFieldValue}
                                  onChange={(e) => setUpdateFieldValue(e.target.value)}
                                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                  placeholder={selectedCol?.type === "number" || selectedCol?.type === "currency" ? "0" : 'לדוגמה: "בוצעה שיחה"'}
                                />
                              );
                            })()}
                            <p className="text-xs text-gray-500 mt-1">
                              הערך הזה יוזן אוטומטית לשדה כאשר האוטומציה תפעל.
                            </p>
                          </div>
                        )}

                        <div>
                          <label htmlFor="automation-record-id" className="block text-sm font-medium text-gray-700 mb-1">
                            מזהה רשומה
                          </label>
                          <input
                            id="automation-record-id"
                            required
                            type="text"
                            value={updateFieldRecordId}
                            onChange={(e) => setUpdateFieldRecordId(e.target.value)}
                            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                            placeholder="הזן את מזהה הרשומה"
                          />
                        </div>
                      </div>
                    )}

                    {/* Confirm Action Button */}
                    {currentActionType && (
                      <div className="mt-6 flex justify-end">
                        <button
                          onClick={handleConfirmAction}
                          disabled={!validateCurrentAction()}
                          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                        >
                          <CheckCircle2 size={16} />
                          {editingActionIndex !== null
                            ? "שמור שינויים"
                            : "אשר פעולה"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : actions.length < maxActions ? (
                  <button
                    onClick={() => setIsAddingAction(true)}
                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 transition-all flex justify-center items-center gap-2 font-medium"
                  >
                    <Plus size={18} />
                    הוסף פעולה נוספת ({actions.length}/{maxActions})
                  </button>
                ) : (
                  <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-sm text-yellow-800 flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                    הגעת למקסימום הפעולות ({maxActions}) עבור אוטומציה זו.
                  </div>
                )}
              </div>

              {error && <div className="text-red-500 text-sm">{error}</div>}
            </div>
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
                disabled={loading || actions.length === 0 || isAddingAction}
                className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium shadow-lg shadow-green-200 disabled:opacity-50 flex items-center gap-2 transition-all"
              >
                {loading && <Loader2 className="animate-spin" size={16} />}
                {mode === "edit" ? "שמור שינויים" : "צור אוטומציה"}
                <CheckCircle2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Action Card Component (game-like UI) ---
function ActionCard({
  title,
  description,
  icon,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative p-5 rounded-xl border-2 transition-all duration-200 group text-right w-full ${
        selected
          ? "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200 ring-offset-2"
          : "border-gray-100 bg-white hover:border-blue-200 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`p-3 rounded-lg ${selected ? "bg-white" : "bg-gray-100 group-hover:bg-white"} transition-colors`}
        >
          {icon}
        </div>
        <div>
          <h4
            className={`font-bold text-lg mb-1 ${selected ? "text-blue-900" : "text-gray-800"}`}
          >
            {title}
          </h4>
          <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        </div>
      </div>
      {selected && (
        <div className="absolute top-4 left-4 text-blue-500">
          <CheckCircle2
            size={20}
            fill="currentColor"
            className="text-blue-100"
          />
        </div>
      )}
    </button>
  );
}

function formatPhonePreview(phone: string) {
  if (!phone) return "";
  let clean = phone.trim().replace(/\D/g, "");
  if (clean.startsWith("0")) clean = "972" + clean.substring(1);
  if (!clean.endsWith("@c.us")) clean = clean + "@c.us";
  return clean;
}
