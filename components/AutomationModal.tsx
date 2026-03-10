"use client";

import { useState, useEffect, useRef } from "react";
import {
  createAutomationRule,
  updateAutomationRule,
} from "@/app/actions/automations";
import { getTableById } from "@/app/actions/tables";
import { getActionsPerAutomationLimit } from "@/lib/plan-limits";
import {
  X,
  Loader2,
  ListTodo,
  TableProperties,
  Clock,
  ArrowRight,
  ArrowLeft,
  Bell,
  Timer,
  CheckCircle2,
  MousePointer2,
  CalendarClock,
  ChevronDown,
  MessageSquare,
  FileText,
  Image as ImageIcon,
  Copy,
  Pencil,
  CheckSquare,
  Phone,
  AlertCircle,
} from "lucide-react";
import { getAllFiles } from "@/app/actions/storage";
import { getFriendlyResultError, getUserFriendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { showAlert } from "@/hooks/use-modal";

interface User {
  id: number;
  name: string;
}

interface AutomationModalProps {
  users: User[];
  tables: { id: number; name: string }[];
  currentUserId: number;
  onClose: () => void;
  onCreated: () => void;
  editingRule?: {
    id: number;
    name: string;
    triggerType: string;
    triggerConfig: any;
    actionType: string;
    actionConfig: any;
  } | null;
  initialSchema?: {
    name: string;
    triggerType: string;
    triggerConfig: any;
    actionType: string;
    actionConfig: any;
  } | null;
  userPlan?: string;
}

export default function AutomationModal({
  users,
  tables,
  currentUserId,
  onClose,
  onCreated,
  editingRule,
  initialSchema,
  userPlan = "basic",
}: AutomationModalProps) {
  // --- Wizard State ---
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // Calculate max actions based on user plan
  const maxActions = getActionsPerAutomationLimit(userPlan);

  // Source for pre-populating form fields (editingRule takes priority)
  const source = editingRule || initialSchema || null;

  // --- Form State ---
  const [name, setName] = useState(source?.name || "");
  const [triggerType, setTriggerType] = useState<
    | "TASK_STATUS_CHANGE"
    | "NEW_RECORD"
    | "RECORD_FIELD_CHANGE"
    | "TIME_SINCE_CREATION"
    | "DIRECT_DIAL"
  >((source?.triggerType as any) || "RECORD_FIELD_CHANGE");

  // Task specific
  const [toStatus, setToStatus] = useState(
    source?.triggerConfig?.toStatus || "any",
  );
  const [fromStatus, setFromStatus] = useState(
    source?.triggerConfig?.fromStatus || "any",
  );

  // Generic Record specific
  const [tableId, setTableId] = useState(
    source?.triggerConfig?.tableId || "",
  );
  const [columnId, setColumnId] = useState(
    source?.triggerConfig?.columnId || "",
  );
  const [fromValue, setFromValue] = useState(
    source?.triggerConfig?.fromValue || "",
  );
  const [toValue, setToValue] = useState(
    source?.triggerConfig?.toValue || "",
  );
  const [operator, setOperator] = useState(
    source?.triggerConfig?.operator || "",
  );

  // Time Based Trigger specific
  const [timeValue, setTimeValue] = useState(
    source?.triggerConfig?.timeValue || source?.triggerConfig?.duration || "",
  );
  const [timeUnit, setTimeUnit] = useState(
    source?.triggerConfig?.timeUnit || source?.triggerConfig?.unit || "hours",
  );
  const [conditionColumnId, setConditionColumnId] = useState(
    source?.triggerConfig?.conditionColumnId || "",
  );
  const [conditionValue, setConditionValue] = useState(
    source?.triggerConfig?.conditionValue || "",
  );

  const [columns, setColumns] = useState<any[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  const [availableFiles, setAvailableFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showDynamicValues, setShowDynamicValues] = useState(false);

  // --- Actions State ---
  // We now support multiple actions.
  // If editing legacy rule, we convert it to array.
  const [actions, setActions] = useState<{ type: string; config: any }[]>(
    () => {
      if (!source) return [];
      if (source.actionType === "MULTI_ACTION") {
        return source.actionConfig?.actions || [];
      }
      return [
        {
          type: source.actionType,
          config: source.actionConfig || {},
        },
      ];
    },
  );

  // State for the CURRENT action being added/edited
  const [isAddingAction, setIsAddingAction] = useState(actions.length === 0);
  const [currentActionType, setCurrentActionType] = useState<
    | "SEND_NOTIFICATION"
    | "CALCULATE_DURATION"
    | "SEND_WHATSAPP"
    | "SEND_SMS"
    | "WEBHOOK"
    | "CREATE_TASK"
    | "UPDATE_RECORD_FIELD"
    | ""
  >("");
  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(
    null,
  );

  // Temporary config state for the current action
  const [recipientId, setRecipientId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(
    "המשימה {taskTitle} עברה לסטטוס {toStatus}",
  );

  // WhatsApp Specific
  const [waPhoneColumnId, setWaPhoneColumnId] = useState("");
  const [waTargetType, setWaTargetType] = useState<"private" | "group">(
    "private",
  );
  const [waMessageType, setWaMessageType] = useState<
    "private" | "group" | "media"
  >("private");
  const [waContent, setWaContent] = useState("");
  const [waMediaFileId, setWaMediaFileId] = useState("");
  const [waDelay, setWaDelay] = useState(0);

  // Webhook Specific
  const [webhookUrl, setWebhookUrl] = useState("");

  // Create Task Specific
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [taskPriority, setTaskPriority] = useState("low");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [taskDueDays, setTaskDueDays] = useState(0);
  const [taskTags, setTaskTags] = useState<string[]>([]);
  const [taskTagInput, setTaskTagInput] = useState("");

  // Update Record Field Specific
  const [updateFieldTableId, setUpdateFieldTableId] = useState("");
  const [updateFieldColumnId, setUpdateFieldColumnId] = useState("");
  const [updateFieldValue, setUpdateFieldValue] = useState("");
  const [updateFieldRecordId, setUpdateFieldRecordId] = useState("");
  const [updateFieldColumns, setUpdateFieldColumns] = useState<any[]>([]);
  const [loadingUpdateFieldColumns, setLoadingUpdateFieldColumns] = useState(false);

  const handleAddTaskTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (e.type === "keydown" && (e as React.KeyboardEvent).key !== "Enter")
      return;
    e.preventDefault();
    const tag = taskTagInput.trim();
    if (tag && !taskTags.includes(tag)) {
      setTaskTags([...taskTags, tag]);
      setTaskTagInput("");
    }
  };

  const removeTaskTag = (tagToRemove: string) => {
    setTaskTags(taskTags.filter((t) => t !== tagToRemove));
  };

  // Cache: avoid re-fetching columns when only triggerType changes (same tableId)
  const columnsCache = useRef<Record<number, any[]>>({});
  // Cache: avoid re-fetching files on every media type toggle
  const filesCached = useRef(false);

  // Fetch columns when table changes (triggerType only controls whether columns are shown)
  useEffect(() => {
    const needsColumns =
      triggerType === "RECORD_FIELD_CHANGE" ||
      triggerType === "TIME_SINCE_CREATION" ||
      triggerType === "NEW_RECORD" ||
      triggerType === "DIRECT_DIAL";

    if (!tableId || !needsColumns) {
      setColumns([]);
      return;
    }

    const numTableId = Number(tableId);

    // Return cached columns if available for this table
    if (columnsCache.current[numTableId]) {
      setColumns(columnsCache.current[numTableId]);
      return;
    }

    setLoadingColumns(true);
    getTableById(numTableId)
      .then((res) => {
        if (res.success && res.data && res.data.schemaJson) {
          const schema = res.data.schemaJson as any;
          let cols: any[] = [];
          if (Array.isArray(schema)) {
            cols = schema;
          } else if (schema && Array.isArray(schema.columns)) {
            cols = schema.columns;
          }
          columnsCache.current[numTableId] = cols;
          setColumns(cols);
        }
      })
      .finally(() => setLoadingColumns(false));
  }, [tableId, triggerType]);

  // Load columns for UPDATE_RECORD_FIELD action when its table changes
  useEffect(() => {
    if (!updateFieldTableId) {
      setUpdateFieldColumns([]);
      return;
    }
    const numId = Number(updateFieldTableId);
    if (columnsCache.current[numId]) {
      setUpdateFieldColumns(columnsCache.current[numId]);
      return;
    }
    setLoadingUpdateFieldColumns(true);
    getTableById(numId)
      .then((res) => {
        if (res.success && res.data && res.data.schemaJson) {
          const schema = res.data.schemaJson as any;
          let cols: any[] = [];
          if (Array.isArray(schema)) {
            cols = schema;
          } else if (schema && Array.isArray(schema.columns)) {
            cols = schema.columns;
          }
          columnsCache.current[numId] = cols;
          setUpdateFieldColumns(cols);
        }
      })
      .finally(() => setLoadingUpdateFieldColumns(false));
  }, [updateFieldTableId]);

  // Load files when WhatsApp media is selected (cached — only fetch once)
  useEffect(() => {
    if (waMessageType === "media" && !filesCached.current) {
      setLoadingFiles(true);
      getAllFiles()
        .then((files) => {
          setAvailableFiles(files);
          filesCached.current = true;
        })
        .finally(() => setLoadingFiles(false));
    }
  }, [waMessageType]);

  // Auto-adjust timeValue when switching to minutes with value < 5
  useEffect(() => {
    if (timeUnit === "minutes" && timeValue && Number(timeValue) < 5) {
      setTimeValue("5");
    }
  }, [timeUnit, timeValue]);

  const [loading, setLoading] = useState(false);

  // Advanced Conditions State
  const [useBusinessHours, setUseBusinessHours] = useState(
    !!source?.triggerConfig?.businessHours,
  );
  const [activeDays, setActiveDays] = useState<number[]>(
    source?.triggerConfig?.businessHours?.days || [0, 1, 2, 3, 4],
  );
  const [startTime, setStartTime] = useState(
    source?.triggerConfig?.businessHours?.start || "09:00",
  );
  const [endTime, setEndTime] = useState(
    source?.triggerConfig?.businessHours?.end || "17:00",
  );

  // --- Logic Helpers ---

  const TRIGGER_COLUMN_TYPES = new Set([
    "select", "multiSelect", "status", "priority",
    "number", "currency",
    "boolean", "checkbox",
    "date",
  ]);

  const selectedColumn = columns.find(
    (c) => c.id === columnId || c.name === columnId,
  );
  const isSelectColumn =
    selectedColumn &&
    (selectedColumn.type === "select" || selectedColumn.type === "multiSelect");

  const isNumericColumn =
    selectedColumn &&
    ["number", "currency", "percent", "rating", "score", "autoNumber"].includes(
      selectedColumn.type,
    );

  const selectedConditionColumn = columns.find(
    (c) => c.id === conditionColumnId || c.name === conditionColumnId,
  );
  const isSelectConditionColumn =
    selectedConditionColumn &&
    (selectedConditionColumn.type === "select" ||
      selectedConditionColumn.type === "multiSelect" ||
      selectedConditionColumn.type === "status");

  // --- Submission ---
  // --- Submission ---
  const handleSubmit = async () => {
    setLoading(true);

    try {
      let triggerConfig: any = {};

      if (triggerType === "TASK_STATUS_CHANGE") {
        triggerConfig = {
          toStatus: toStatus === "any" ? undefined : toStatus,
          fromStatus: fromStatus === "any" ? undefined : fromStatus,
        };
      } else if (triggerType === "NEW_RECORD") {
        triggerConfig = {
          tableId,
          conditionColumnId,
          conditionValue,
          operator: operator || undefined,
        };
      } else if (triggerType === "RECORD_FIELD_CHANGE") {
        triggerConfig = {
          tableId,
          columnId,
          fromValue: fromValue || undefined,
          toValue: toValue || undefined,
          operator: operator || undefined,
        };
      } else if (triggerType === "TIME_SINCE_CREATION") {
        triggerConfig = {
          tableId,
          timeValue: Number(timeValue),
          timeUnit,
          conditionColumnId,
          conditionValue,
        };
      } else if (triggerType === "DIRECT_DIAL") {
        triggerConfig = {
          tableId,
        };
      }

      if (useBusinessHours) {
        triggerConfig.businessHours = {
          days: activeDays,
          start: startTime,
          end: endTime,
        };
      }

      // Determine Action Payload
      let finalActionType = "";
      let finalActionConfig = {};

      if (actions.length > 1) {
        finalActionType = "MULTI_ACTION";
        finalActionConfig = { actions };
      } else if (actions.length === 1) {
        // Use the specific type directly for backward compatibility / simplicity
        finalActionType = actions[0].type;
        finalActionConfig = actions[0].config;
      } else {
        // Should not happen if validation works
        showAlert("נא לבחור לפחות פעולה אחת");
        setLoading(false);
        return;
      }

      const data = {
        name,
        triggerType,
        triggerConfig,
        actionType: finalActionType,
        actionConfig: finalActionConfig,
      };

      let result;
      if (editingRule) {
        result = await updateAutomationRule(editingRule.id, data);
      } else {
        result = await createAutomationRule(data);
      }

      if (result.success) {
        toast.success("האוטומציה נשמרה בהצלחה");
        onCreated();
        onClose();
      } else {
        toast.error(getFriendlyResultError(result.error, "שגיאה בשמירת האוטומציה"));
      }
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  // --- Action Management ---
  const handleConfirmAction = () => {
    if (!validateCurrentAction()) return;

    const newActionConfig: any =
      currentActionType === "WEBHOOK"
        ? { webhookUrl }
        : currentActionType === "SEND_NOTIFICATION"
          ? {
              recipientId: parseInt(recipientId),
              messageTemplate,
              titleTemplate: "עדכון במערכת",
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
                  description: taskDescription,
                  status: taskStatus,
                  priority: taskPriority,
                  assigneeId: taskAssigneeId ? Number(taskAssigneeId) : null,
                  dueDays: Number(taskDueDays),
                  tags: taskTags,
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
      // Update existing
      const newActions = [...actions];
      newActions[editingActionIndex] = actionObj;
      setActions(newActions);
      setEditingActionIndex(null);
    } else {
      // Add new
      setActions([...actions, actionObj]);
    }

    // Reset fields
    setIsAddingAction(false);
    setCurrentActionType("");
    setRecipientId("");
    setMessageTemplate("המשימה {taskTitle} עברה לסטטוס {toStatus}");
    setWaPhoneColumnId("");
    setWaContent("");
    setWaMediaFileId("");
    setWaDelay(0);
    setWaDelay(0);
    setWebhookUrl("");
    setTaskTitle("");
    setTaskDescription("");
    setTaskStatus("todo");
    setTaskPriority("low");
    setTaskAssigneeId("");
    setTaskDueDays(0);
    setTaskTags([]);
    setTaskTagInput("");
    setUpdateFieldTableId("");
    setUpdateFieldColumnId("");
    setUpdateFieldValue("");
    setUpdateFieldRecordId("");
  };

  const removeAction = (index: number) => {
    const newActions = [...actions];
    newActions.splice(index, 1);
    setActions(newActions);
    if (newActions.length === 0) {
      setIsAddingAction(true);
      setEditingActionIndex(null);
    }
  };

  const editAction = (index: number) => {
    const action = actions[index];
    setCurrentActionType(action.type as any);

    // Populate fields based on type
    if (action.type === "SEND_NOTIFICATION") {
      setRecipientId(action.config.recipientId?.toString() || "");
      setMessageTemplate(action.config.messageTemplate || "");
    } else if (action.type === "SEND_WHATSAPP" || action.type === "SEND_SMS") {
      setWaPhoneColumnId(action.config.phoneColumnId || "");
      setWaTargetType(
        action.config.phoneColumnId?.includes("@g.us") ? "group" : "private",
      );
      setWaMessageType(action.config.messageType || "private");
      setWaContent(action.config.content || "");
      setWaMediaFileId(action.config.mediaFileId?.toString() || "");
      setWaDelay(action.config.delay || 0);
    } else if (action.type === "WEBHOOK") {
      setWebhookUrl(action.config.webhookUrl || "");
    } else if (action.type === "CREATE_TASK") {
      setTaskTitle(action.config.title || "");
      setTaskDescription(action.config.description || "");
      setTaskStatus(action.config.status || "todo");
      setTaskPriority(action.config.priority || "low");
      setTaskAssigneeId(action.config.assigneeId?.toString() || "");
      setTaskDueDays(action.config.dueDays || 0);
      setTaskTags(action.config.tags || []);
    } else if (action.type === "UPDATE_RECORD_FIELD") {
      setUpdateFieldTableId(action.config.tableId || "");
      setUpdateFieldColumnId(action.config.columnId || "");
      setUpdateFieldValue(action.config.value || "");
      setUpdateFieldRecordId(action.config.recordId || "");
    }

    setEditingActionIndex(index);
    setIsAddingAction(true);
  };

  const handleNextStep = () => {
    if (step === 3) {
      // If user is currently adding an action and hits "Next" (shouldn't happen if UI is correct, but safe guard)
      // We could auto-save if valid?
      if (isAddingAction && validateCurrentAction()) {
        handleConfirmAction();
        // Then check if we should move on?
        // Actually, if they confirmed, we just show the summary screen.
        // But if they clicked "Finish" (Step 4), they might expect to go to Step 4.
        // Let's assume footer handles this.
      }
      if (actions.length > 0 && !isAddingAction) {
        setStep(step + 1);
      }
    } else {
      setStep(step + 1);
    }
  };

  // --- Validation ---
  const canProceedToStep2 = name.length > 2;
  const canProceedToStep3 = () => {
    if (triggerType === "NEW_RECORD") return !!tableId;
    if (triggerType === "TASK_STATUS_CHANGE") return true;
    if (triggerType === "RECORD_FIELD_CHANGE") return !!tableId && !!columnId;
    if (triggerType === "TIME_SINCE_CREATION") {
      if (!tableId || !timeValue) return false;
      // If minutes selected, minimum is 5
      if (timeUnit === "minutes" && Number(timeValue) < 5) return false;
      return true;
    }
    if (triggerType === "DIRECT_DIAL") return !!tableId;
    return false;
  };

  const validateCurrentAction = () => {
    if (!currentActionType) return false;
    if (currentActionType === "SEND_NOTIFICATION")
      return !!recipientId && !!messageTemplate;
    if (currentActionType === "SEND_WHATSAPP" || currentActionType === "SEND_SMS") {
      if (!waPhoneColumnId) return false;
      if (!waContent) return false;
      if (waMessageType === "media" && !waMediaFileId) return false;

      // Check delay
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
    if (currentActionType === "UPDATE_RECORD_FIELD") {
      return !!updateFieldTableId && !!updateFieldColumnId && !!updateFieldValue && !!updateFieldRecordId;
    }
    if (currentActionType === "CALCULATE_DURATION") return true;
    return false;
  };

  const canSubmit = () => {
    // If we are currently adding an action, we can't submit the whole form yet
    // unless we treat "submit" as "save current action and submit", but it's cleaner to force them to "Add" first.
    // However, for UX, if they have 1 action and are not adding another, they proceed.

    if (actions.length > 0 && !isAddingAction) return true;

    // If they are in the middle of adding the FIRST action, we check if it's valid
    if (actions.length === 0 && isAddingAction) {
      return validateCurrentAction();
    }

    return false;
  };

  // --- Steps Components ---

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          איך נקרא לאוטומציה הזו?
        </label>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="לדוגמה: התראה על ליד חדש"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          מה יפעיל את האוטומציה?
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TriggerCard
            title="שינוי סטטוס משימה"
            description="כאשר משימה עוברת לסטטוס מסוים"
            icon={<ListTodo className="text-blue-500" size={24} />}
            selected={triggerType === "TASK_STATUS_CHANGE"}
            onClick={() => {
              setTriggerType("TASK_STATUS_CHANGE");
              setMessageTemplate("המשימה {taskTitle} עברה לסטטוס {toStatus}");
            }}
          />
          <TriggerCard
            title="רשומה חדשה"
            description="כאשר נוספת רשומה חדשה לטבלה"
            icon={<TableProperties className="text-green-500" size={24} />}
            selected={triggerType === "NEW_RECORD"}
            onClick={() => {
              setTriggerType("NEW_RECORD");
              setMessageTemplate("נוצרה רשומה חדשה בטבלה {tableName}");
            }}
          />
          <TriggerCard
            title="שינוי ערך בטבלה"
            description="כאשר עמודה ספציפית משתנה"
            icon={<MousePointer2 className="text-purple-500" size={24} />}
            selected={triggerType === "RECORD_FIELD_CHANGE"}
            onClick={() => {
              setTriggerType("RECORD_FIELD_CHANGE");
              setMessageTemplate(
                "שדה {fieldName} שונה מ-{fromValue} ל-{toValue}",
              );
            }}
          />
          <TriggerCard
            title="זמן מאז יצירה"
            description="טריגר מבוסס זמן (למשל: שעתיים אחרי יצירה)"
            icon={<Clock className="text-orange-500" size={24} />}
            selected={triggerType === "TIME_SINCE_CREATION"}
            onClick={() => {
              setTriggerType("TIME_SINCE_CREATION");
              setMessageTemplate("חלף זמן מאז יצירת הרשומה בטבלה {tableName}");
            }}
          />
          <TriggerCard
            title="חיוג ישיר"
            description="כאשר מבצעים חיוג ישיר ללקוח מרשומה בטבלה"
            icon={<Phone className="text-green-500" size={24} />}
            selected={triggerType === "DIRECT_DIAL"}
            onClick={() => {
              setTriggerType("DIRECT_DIAL");
              setMessageTemplate("בוצע חיוג ישיר ברשומה בטבלה {tableName}");
            }}
          />
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <div className="bg-gray-50 p-4 rounded-lg mb-4 text-sm text-gray-600 flex items-center gap-2">
        {triggerType === "TASK_STATUS_CHANGE" && <ListTodo size={16} />}
        {triggerType === "NEW_RECORD" && <TableProperties size={16} />}
        {triggerType === "RECORD_FIELD_CHANGE" && <MousePointer2 size={16} />}
        {triggerType === "TIME_SINCE_CREATION" && <Clock size={16} />}
        {triggerType === "DIRECT_DIAL" && <Phone size={16} />}
        <span>
          מגדיר תנאים עבור:
          <span className="font-semibold mx-1">
            {triggerType === "TASK_STATUS_CHANGE" && "שינוי סטטוס משימה"}
            {triggerType === "NEW_RECORD" && "רשומה חדשה"}
            {triggerType === "RECORD_FIELD_CHANGE" && "שינוי שדה"}
            {triggerType === "TIME_SINCE_CREATION" && "זמן מאז יצירה"}
            {triggerType === "DIRECT_DIAL" && "חיוג ישיר"}
          </span>
        </span>
      </div>

      {/* Common Table Selector */}
      {(triggerType === "NEW_RECORD" ||
        triggerType === "RECORD_FIELD_CHANGE" ||
        triggerType === "TIME_SINCE_CREATION" ||
        triggerType === "DIRECT_DIAL") && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            בחר טבלה
          </label>
          <select
            required
            value={tableId}
            autoFocus
            onChange={(e) => setTableId(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">בחר מרשימה...</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Task Specific */}
      {triggerType === "TASK_STATUS_CHANGE" && (
        <div className="p-4 border rounded-lg bg-blue-50 border-blue-100 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              מאיזה סטטוס?
            </label>
            <select
              value={fromStatus}
              onChange={(e) => setFromStatus(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
            >
              <option value="any">מכל סטטוס שהוא</option>
              <option value="todo">משימות</option>
              <option value="in_progress">משימות בטיפול</option>
              <option value="waiting_client">ממתינים לאישור לקוח</option>
              <option value="on_hold">משימות בהשהייה</option>
              <option value="completed_month">בוצעו החודש</option>
              <option value="done">משימות שבוצעו</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              לאיזה סטטוס?
            </label>
            <select
              value={toStatus}
              onChange={(e) => setToStatus(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
            >
              <option value="any">לכל סטטוס שהוא</option>
              <option value="todo">משימות</option>
              <option value="in_progress">משימות בטיפול</option>
              <option value="waiting_client">ממתינים לאישור לקוח</option>
              <option value="on_hold">משימות בהשהייה</option>
              <option value="completed_month">בוצעו החודש</option>
              <option value="done">משימות שבוצעו</option>
            </select>
          </div>
        </div>
      )}

      {/* New Record Specific */}
      {triggerType === "NEW_RECORD" && tableId && (
        <div className="space-y-4 border-t pt-4">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              תנאי נוסף (רק אם...)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={conditionColumnId}
                onChange={(e) => {
                  setConditionColumnId(e.target.value);
                  setConditionValue("");
                  setOperator("");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">תמיד (כל רשומה חדשה)</option>
                {columns.map((col: any) => (
                  <option key={col.id || col.name} value={col.name}>
                    {col.label || col.name}
                  </option>
                ))}
              </select>

              {conditionColumnId &&
                (isSelectConditionColumn ? (
                  <select
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">בחר ערך...</option>
                    {selectedConditionColumn?.options?.map((opt: string) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : // Check if numeric column for operator support
                selectedConditionColumn &&
                  [
                    "number",
                    "currency",
                    "percent",
                    "rating",
                    "score",
                    "autoNumber",
                  ].includes(selectedConditionColumn.type) ? (
                  <div className="flex gap-2">
                    <select
                      value={operator}
                      onChange={(e) => setOperator(e.target.value)}
                      className="w-1/3 px-2 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">אופרטור</option>
                      <option value="gt">&gt;</option>
                      <option value="lt">&lt;</option>
                      <option value="eq">=</option>
                      <option value="neq">≠</option>
                      <option value="gte">≥</option>
                      <option value="lte">≤</option>
                    </select>
                    <input
                      type="number"
                      value={conditionValue}
                      onChange={(e) => setConditionValue(e.target.value)}
                      placeholder="ערך..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    placeholder="ערך שווה ל..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Field Change Specific */}
      {triggerType === "RECORD_FIELD_CHANGE" && tableId && (
        <div className="space-y-4 border-t pt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              איזו עמודה לנטר?
            </label>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-sm text-amber-800 mb-2">
              <AlertCircle className="w-4 h-4 inline-block ml-1" />
              שים לב: ניתן לנטר רק שדות מסוג בחירה (select), מספרי (number), תאריך או סטטוס. שדות טקסט חופשי אינם נתמכים כטריגר.
            </div>
            {loadingColumns ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 p-2">
                <Loader2 className="animate-spin" size={16} /> טוען עמודות...
              </div>
            ) : (
              <select
                required
                value={columnId}
                onChange={(e) => {
                  setColumnId(e.target.value);
                  setFromValue("");
                  setToValue("");
                  setOperator("");
                }}
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">בחר עמודה...</option>
                {columns
                  .filter((col: any) => TRIGGER_COLUMN_TYPES.has(col.type))
                  .map((col: any) => (
                  <option key={col.id || col.name} value={col.name}>
                    {col.label || col.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedColumn && (
            <div className="bg-gray-50 p-4 rounded-lg">
              {isNumericColumn ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      תנאי
                    </label>
                    <select
                      value={operator}
                      onChange={(e) => setOperator(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded text-sm"
                    >
                      <option value="">בחר אופרטור...</option>
                      <option value="gt">גדול מ ( &gt; )</option>
                      <option value="lt">קטן מ ( &lt; )</option>
                      <option value="eq">שווה ל ( = )</option>
                      <option value="neq">לא שווה ל ( ≠ )</option>
                      <option value="gte">גדול או שווה ( ≥ )</option>
                      <option value="lte">קטן או שווה ( ≤ )</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      ערך
                    </label>
                    <input
                      type="number"
                      value={toValue}
                      onChange={(e) => setToValue(e.target.value)}
                      placeholder="הכנס מספר..."
                      className="w-full px-3 py-2 bg-white border rounded text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      ערך מקור (אופציונלי)
                    </label>
                    {isSelectColumn ? (
                      <select
                        value={fromValue}
                        onChange={(e) => setFromValue(e.target.value)}
                        className="w-full px-3 py-2 bg-white border rounded text-sm"
                      >
                        <option value="">הכל</option>
                        {selectedColumn.options?.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={fromValue}
                        onChange={(e) => setFromValue(e.target.value)}
                        placeholder="הכל"
                        className="w-full px-3 py-2 bg-white border rounded text-sm"
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-center pt-5">
                    <ArrowLeft className="text-gray-400" size={20} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      ערך חדש (אופציונלי)
                    </label>
                    {isSelectColumn ? (
                      <select
                        value={toValue}
                        onChange={(e) => setToValue(e.target.value)}
                        className="w-full px-3 py-2 bg-white border rounded text-sm"
                      >
                        <option value="">הכל</option>
                        {selectedColumn.options?.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={toValue}
                        onChange={(e) => setToValue(e.target.value)}
                        placeholder="הכל"
                        className="w-full px-3 py-2 bg-white border rounded text-sm"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Time Specific */}
      {triggerType === "TIME_SINCE_CREATION" && tableId && (
        <div className="space-y-4 border-t pt-4">
          <div className="flex gap-4 items-end bg-orange-50 p-4 rounded-lg border border-orange-100">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                כמות
              </label>
              <input
                type="number"
                min={timeUnit === "minutes" ? "5" : "1"}
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder={timeUnit === "minutes" ? "5" : "1"}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                יחידה
              </label>
              <select
                value={timeUnit}
                onChange={(e) => setTimeUnit(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="hours">שעות</option>
                <option value="days">ימים</option>
                <option value="minutes">דקות</option>
              </select>
            </div>
            <div className="mb-2 text-gray-500 font-medium">לאחר היצירה</div>
          </div>
          {timeUnit === "minutes" && (
            <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg text-sm text-orange-800 flex gap-2 items-start">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>
                <strong>שים לב:</strong> בעת בחירת דקות, הזמן המינימלי הוא 5
                דקות לפחות.
              </span>
            </div>
          )}
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-sm text-blue-800 flex gap-2 items-start">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              <strong>שים לב:</strong> האוטומציה הזו תפעל רק על רשומות שייווצרו
              לאחר יצירת אוטומציה זו. רשומות היסטוריות לא ייחשבו.
            </span>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              תנאי נוסף (רק אם...)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={conditionColumnId}
                onChange={(e) => setConditionColumnId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">תמיד (ללא תנאי)</option>
                {columns.map((col: any) => (
                  <option key={col.id || col.name} value={col.name}>
                    {col.label || col.name}
                  </option>
                ))}
              </select>

              {conditionColumnId &&
                (isSelectConditionColumn ? (
                  <select
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">בחר ערך...</option>
                    {selectedConditionColumn?.options?.map((opt: string) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    placeholder="ערך שווה ל..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          פעולות לביצוע
        </label>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2 mb-2">
          <AlertCircle size={16} className="text-blue-500 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 leading-relaxed">
            {maxActions === 2 ? (
              <>
                כמשתמש רגיל, ניתן להגדיר עד 2 פעולות באוטומציה זו.
                <br />
                למשתמשי פרימיום ניתן להגדיר עד 6 פעולות.
              </>
            ) : (
              <>כמשתמש פרימיום, ניתן להגדיר עד 6 פעולות באוטומציה זו.</>
            )}
          </div>
        </div>
      </div>

      {/* List of Configured Actions */}
      {actions.length > 0 && (
        <div className="space-y-3 mb-6">
          {actions.map((act, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  {act.type === "SEND_NOTIFICATION" && <Bell size={20} />}
                  {act.type === "SEND_WHATSAPP" && <MessageSquare size={20} />}
                  {act.type === "SEND_SMS" && <Phone size={20} />}
                  {act.type === "WEBHOOK" && (
                    <div className="font-bold text-xs">API</div>
                  )}
                  {act.type === "CALCULATE_DURATION" && <Timer size={20} />}
                  {act.type === "CREATE_TASK" && <CheckSquare size={20} />}
                  {act.type === "UPDATE_RECORD_FIELD" && <Pencil size={20} />}
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {act.type === "SEND_NOTIFICATION" && "שליחת התראה"}
                    {act.type === "SEND_WHATSAPP" && "שליחת WhatsApp"}
                    {act.type === "SEND_SMS" && "שליחת SMS"}
                    {act.type === "WEBHOOK" && "Webhook"}
                    {act.type === "CALCULATE_DURATION" && "חישוב זמן"}
                    {act.type === "CREATE_TASK" && "יצירת משימה"}
                    {act.type === "UPDATE_RECORD_FIELD" && "עדכון שדה ברשומה"}
                  </div>
                  <div className="text-xs text-gray-500">פעולה #{idx + 1}</div>
                </div>
              </div>
              {!isAddingAction && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => editAction(idx)}
                    className="text-blue-500 hover:text-blue-700 p-2 hover:bg-blue-50 rounded-full transition-colors"
                    title="ערוך פעולה"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => removeAction(idx)}
                    className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors"
                    title="מחק פעולה"
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
        <div className="border-t pt-4">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-medium text-gray-800">
              {editingActionIndex !== null
                ? `עריכת פעולה #${editingActionIndex + 1}`
                : `הוספת פעולה חדשה (${actions.length + 1}/3)`}
            </h4>
            <button
              onClick={() => {
                setIsAddingAction(false);
                setEditingActionIndex(null);
                // Also clear fields?
                // Ideally yes, but `editAction` overwrites them.
                // If we cancel "Add New", we want clear fields.
                // If we cancel "Edit", we want clear fields.
                // Let's rely on `setIsAddingAction` triggering a reset later?
                // No, `handleConfirmAction` resets fields.
                // We should reset fields manually here if canceling.
                setCurrentActionType("");
                setRecipientId("");
                setWaPhoneColumnId("");
                setTaskTitle("");
                setTaskDescription("");
                setTaskStatus("todo");
                setTaskPriority("low");
                setTaskAssigneeId("");
                setTaskTags([]);
                setUpdateFieldTableId("");
                setUpdateFieldColumnId("");
                setUpdateFieldValue("");
                setUpdateFieldRecordId("");
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ביטול
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <TriggerCard
              title="שליחת התראה"
              description="שלח הודעה למערכת"
              icon={<Bell className="text-yellow-500" size={24} />}
              selected={currentActionType === "SEND_NOTIFICATION"}
              onClick={() => setCurrentActionType("SEND_NOTIFICATION")}
            />
            <TriggerCard
              title="שליחת WhatsApp"
              description="שלח הודעה דרך Green API"
              icon={<MessageSquare className="text-green-600" size={24} />}
              selected={currentActionType === "SEND_WHATSAPP"}
              onClick={() => setCurrentActionType("SEND_WHATSAPP")}
            />
            <TriggerCard
              title="שליחת SMS"
              description="שלח הודעת SMS לנמען"
              icon={<Phone className="text-blue-600" size={24} />}
              selected={currentActionType === "SEND_SMS"}
              onClick={() => setCurrentActionType("SEND_SMS")}
            />
            <TriggerCard
              title="חישוב זמן"
              description="חשב ושמור את זמן השהייה בסטטוס"
              icon={<Timer className="text-teal-500" size={24} />}
              selected={currentActionType === "CALCULATE_DURATION"}
              onClick={() => setCurrentActionType("CALCULATE_DURATION")}
            />
            <TriggerCard
              title="Webhook"
              description="שלח נתונים למערכת חיצונית"
              icon={<div className="font-bold text-gray-600 text-lg">Api</div>}
              selected={currentActionType === "WEBHOOK"}
              onClick={() => setCurrentActionType("WEBHOOK")}
            />
            <TriggerCard
              title="יצירת משימה"
              description="צור משימה חדשה אוטומטית"
              icon={<CheckSquare className="text-blue-500" size={24} />}
              selected={currentActionType === "CREATE_TASK"}
              onClick={() => setCurrentActionType("CREATE_TASK")}
            />
            {/* Show Update Record Field for all Record-based triggers */}
            {(triggerType === "DIRECT_DIAL" ||
              triggerType === "NEW_RECORD" ||
              triggerType === "RECORD_FIELD_CHANGE" ||
              triggerType === "TIME_SINCE_CREATION") && (
              <TriggerCard
                title="עדכון שדה ברשומה"
                description="עדכן ערך בשדה מסוים ברשומה"
                icon={<Pencil className="text-purple-500" size={24} />}
                selected={currentActionType === "UPDATE_RECORD_FIELD"}
                onClick={() => setCurrentActionType("UPDATE_RECORD_FIELD")}
              />
            )}
          </div>

          {currentActionType === "SEND_NOTIFICATION" && (
            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 space-y-4 animate-in slide-in-from-top-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  למי לשלוח?
                </label>
                <select
                  required
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                >
                  <option value="">בחר משתמש...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  הודעה
                </label>
                <textarea
                  required
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                />
                <p className="text-xs text-gray-500 mt-2">
                  טיפ: השתמש ב- {"{tableName}"} או {"{fieldName}"} כדי להוסיף
                  מידע דינמי.
                </p>
              </div>
            </div>
          )}

          {(currentActionType === "SEND_WHATSAPP" || currentActionType === "SEND_SMS") && (
            <div className={`${currentActionType === "SEND_SMS" ? "bg-blue-50" : "bg-green-50"} p-6 rounded-xl border ${currentActionType === "SEND_SMS" ? "border-blue-100" : "border-green-100"} space-y-5 animate-in slide-in-from-top-2`}>
              <div className={`flex items-center gap-2 mb-2 ${currentActionType === "SEND_SMS" ? "text-blue-800" : "text-green-800"} font-medium pb-2 border-b ${currentActionType === "SEND_SMS" ? "border-blue-200" : "border-green-200"}`}>
                {currentActionType === "SEND_SMS" ? <Phone size={18} /> : <MessageSquare size={18} />}
                {currentActionType === "SEND_SMS" ? "הגדרות הודעת SMS" : "הגדרות הודעת WhatsApp"}
              </div>

              {/* Target Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  למי לשלוח?
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors flex-1">
                    <input
                      type="radio"
                      name="waTargetType"
                      value="private"
                      checked={waTargetType === "private"}
                      onChange={() => {
                        setWaTargetType("private");
                        setWaPhoneColumnId(""); // Reset needed
                      }}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium text-gray-700">אדם פרטי</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors flex-1">
                    <input
                      type="radio"
                      name="waTargetType"
                      value="group"
                      checked={waTargetType === "group"}
                      onChange={() => {
                        setWaTargetType("group");
                        setWaPhoneColumnId("manual:"); // Start with manual for group
                      }}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium text-gray-700">קבוצה</span>
                  </label>
                </div>
              </div>

              {/* Target Configuration */}
              {waTargetType === "private" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    פרטי הנמען
                  </label>
                  <div className="flex gap-4 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="phoneMode"
                        checked={!waPhoneColumnId.startsWith("manual:")}
                        onChange={() => setWaPhoneColumnId("")}
                        className="text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700">
                        לפי עמודה בטבלה
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="phoneMode"
                        checked={waPhoneColumnId.startsWith("manual:")}
                        onChange={() => setWaPhoneColumnId("manual:")}
                        className="text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700">
                        מספר ידני קבוע
                      </span>
                    </label>
                  </div>

                  {!waPhoneColumnId.startsWith("manual:") ? (
                    triggerType === "TASK_STATUS_CHANGE" ? (
                      <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded border border-gray-200">
                        באוטומציות משימה, לא ניתן לבחור עמודה דינמית כי אין טבלה
                        משויכת ישירות.
                        <br />
                        נא להשתמש במספר ידני או לשנות סוג אוטומציה.
                      </div>
                    ) : (
                      <>
                        <select
                          required
                          value={waPhoneColumnId}
                          onChange={(e) => setWaPhoneColumnId(e.target.value)}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">בחר עמודה מהטבלה...</option>
                          {columns.map((col: any) => (
                            <option key={col.id || col.name} value={col.name}>
                              {col.label || col.name} ({col.type})
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-green-600 mt-1">
                          נא לבחור עמודה המכילה מספרי טלפון תקינים.
                        </p>
                      </>
                    )
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={waPhoneColumnId.replace("manual:", "")}
                        onChange={(e) =>
                          setWaPhoneColumnId(`manual:${e.target.value}`)
                        }
                        placeholder="הכנס מספר טלפון (לדוגמה: 0501234567)"
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500"
                        dir="ltr"
                      />
                      <div className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                        <strong>תצוגה מקדימה לשליחה:</strong>{" "}
                        <span dir="ltr" className="font-mono">
                          {formatPhonePreview(
                            waPhoneColumnId.replace("manual:", ""),
                            "private",
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Group Mode
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    מזהה קבוצה (Group ID)
                  </label>
                  <input
                    type="text"
                    value={waPhoneColumnId.replace("manual:", "")}
                    onChange={(e) =>
                      setWaPhoneColumnId(`manual:${e.target.value}`)
                    }
                    placeholder="לדוגמה: 123456789-1612345678@g.us"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500 font-mono text-sm"
                    dir="ltr"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ניתן למצוא את מזהה הקבוצה ב-Green API או דרך הדפדפן (סיומת
                    @g.us).
                  </p>
                  {waPhoneColumnId.startsWith("manual:") && (
                    <div className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                      <strong>תצוגה מקדימה לשליחה:</strong>{" "}
                      <span dir="ltr" className="font-mono">
                        {formatPhonePreview(
                          waPhoneColumnId.replace("manual:", ""),
                          "group",
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Delay Logic */}
              {(() => {
                const waBeforeCount =
                  editingActionIndex !== null
                    ? actions.filter(
                        (a, i) =>
                          (a.type === "SEND_WHATSAPP" || a.type === "SEND_SMS") && i < editingActionIndex,
                      ).length
                    : actions.filter((a) => a.type === "SEND_WHATSAPP" || a.type === "SEND_SMS").length;

                if (waBeforeCount > 0) {
                  const minDelay = waBeforeCount >= 2 ? 20 : 10;
                  return (
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 mb-4 animate-in slide-in-from-top-2">
                      <div className="flex items-center gap-2 text-orange-800 font-medium mb-2">
                        <Clock size={16} />
                        השהייה לפני שליחה (בשניות)
                      </div>
                      <p className="text-xs text-orange-600 mb-3">
                        נא להגדיר השהייה של לפחות {minDelay} שניות כדי למנוע
                        חסימה ע"י Green API.
                      </p>
                      <input
                        type="number"
                        min={minDelay}
                        value={waDelay}
                        onChange={(e) =>
                          setWaDelay(parseInt(e.target.value) || 0)
                        }
                        className={`w-full px-4 py-2 bg-white border rounded-lg shadow-sm ${waDelay < minDelay ? "border-red-500 ring-1 ring-red-500" : "border-orange-200"}`}
                      />
                      {waDelay < minDelay && (
                        <p className="text-xs text-red-500 mt-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    בחר קובץ לשליחה
                  </label>
                  {loadingFiles ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                      <Loader2 className="animate-spin" size={16} /> טוען
                      קבצים...
                    </div>
                  ) : (
                    <select
                      value={waMediaFileId}
                      onChange={(e) => setWaMediaFileId(e.target.value)}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {waMessageType === "media"
                    ? "כיתוב (Caption)"
                    : "תוכן ההודעה"}
                </label>
                <textarea
                  required
                  value={waContent}
                  onChange={(e) => setWaContent(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  placeholder="הקלד את ההודעה כאן..."
                />
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setShowDynamicValues(!showDynamicValues)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    לפתיחת הערכים לשימוש מהרשומה הנוכחית לחץ כאן:
                    <ChevronDown
                      size={16}
                      className={`transition-transform ${showDynamicValues ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showDynamicValues && (
                    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {columns.length > 0 ? (
                        columns.map((col: any) => (
                          <button
                            key={col.id || col.name}
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`{${col.name}}`);
                            }}
                            className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded text-xs hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                            title="לחץ להעתקה"
                          >
                            <span
                              className="font-mono text-gray-600 truncate max-w-[120px]"
                              dir="ltr"
                            >{`{${col.name}}`}</span>
                            <Copy
                              size={12}
                              className="text-gray-400 group-hover:text-blue-500"
                            />
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-gray-500 col-span-2">
                          לא נמצאו עמודות זמינות (או שלא נבחרה טבלה).
                        </p>
                      )}
                    </div>
                  )}
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

          {currentActionType === "WEBHOOK" && (
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 space-y-5 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2 mb-2 text-gray-800 font-medium pb-2 border-b border-gray-200">
                Webhook Configuration
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  כתובת ה-URL לשליחה (POST)
                </label>
                <input
                  type="url"
                  required
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://api.example.com/webhook"
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm font-mono text-sm ltr"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-2">
                  המערכת תשלח בקשת POST לכתובת זו עם כל הנתונים הרלוונטיים
                  (JSON).
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  כותרת המשימה
                </label>
                <input
                  required
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="לדוגמה: לחזור לליד {name}"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ניתן להשתמש בסוגריים מסולסלים כדי לשלב ערכים דינמיים.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  תיאור
                </label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  rows={3}
                  placeholder="תיאור המשימה..."
                />
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setShowDynamicValues(!showDynamicValues)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    לפתיחת הערכים לשימוש מהרשומה הנוכחית לחץ כאן:
                    <ChevronDown
                      size={16}
                      className={`transition-transform ${showDynamicValues ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showDynamicValues && (
                    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {columns.length > 0 ? (
                        columns.map((col: any) => (
                          <button
                            key={col.id || col.name}
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`{${col.name}}`);
                            }}
                            className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded text-xs hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                            title="לחץ להעתקה"
                          >
                            <span
                              className="font-mono text-gray-600 truncate max-w-[120px]"
                              dir="ltr"
                            >{`{${col.name}}`}</span>
                            <Copy
                              size={12}
                              className="text-gray-400 group-hover:text-blue-500"
                            />
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-gray-500 col-span-2">
                          לא נמצאו עמודות זמינות (או שלא נבחרה טבלה).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    סטטוס
                  </label>
                  <select
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    עדיפות
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                  >
                    <option value="low">נמוך</option>
                    <option value="medium">בינוני</option>
                    <option value="high">גבוה</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    אחראי
                  </label>
                  <select
                    value={taskAssigneeId}
                    onChange={(e) => setTaskAssigneeId(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                  >
                    <option value="">ללא אחראי</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    תאריך יעד (ימים מהיצירה)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={taskDueDays}
                    onChange={(e) => setTaskDueDays(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                    placeholder="0 = היום"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  תגיות
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    value={taskTagInput}
                    onChange={(e) => setTaskTagInput(e.target.value)}
                    onKeyDown={handleAddTaskTag}
                    placeholder="הקלד תגית ולחץ Enter"
                    className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddTaskTag}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors text-sm border border-gray-300"
                  >
                    הוסף
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {taskTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTaskTag(tag)}
                        className="hover:text-blue-900 transition-colors font-bold px-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  בחר טבלה
                </label>
                <select
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    בחר שדה לעדכון
                  </label>
                  {loadingUpdateFieldColumns ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                      <Loader2 className="animate-spin" size={16} /> טוען
                      עמודות...
                    </div>
                  ) : (
                    <select
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    הערך הזה יוזן אוטומטית לשדה כאשר יבוצע חיוג ישיר.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  מזהה רשומה
                </label>
                <input
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

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleConfirmAction}
              disabled={!validateCurrentAction()}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {actions.length > 0 ? "הוסף פעולה נוספת וסיים" : "אשר פעולה"}
            </button>
          </div>
        </div>
      ) : // Add Action Button (if not adding and less than max)
      actions.length < maxActions ? (
        <div className="bg-gray-50 p-8 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center text-center">
          <p className="text-gray-600 mb-4 font-medium">
            האם תרצה לבצע פעולה נוספת?
          </p>
          <button
            onClick={() => setIsAddingAction(true)}
            className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center gap-2"
          >
            <ListTodo size={18} />
            הוסף פעולה נוספת (+{actions.length}/{maxActions})
          </button>
        </div>
      ) : (
        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-sm text-yellow-800 flex items-start gap-2">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          הגעת למקסימום הפעולות ({maxActions}) עבור אוטומציה זו.
        </div>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <label className="block text-lg font-medium text-gray-800 mb-2">
        תנאים מתקדמים ומגבלות
      </label>
      <p className="text-sm text-gray-500 mb-6">
        הגדר מתי האוטומציה הזו מורשית לפעול. במידה והתנאים לא מתקיימים,
        האוטומציה תדולג.
      </p>

      <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
        <div className="flex items-center gap-3 mb-6">
          <input
            type="checkbox"
            id="useBusinessHours"
            checked={useBusinessHours}
            onChange={(e) => setUseBusinessHours(e.target.checked)}
            className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
          />
          <label
            htmlFor="useBusinessHours"
            className="text-base font-medium text-gray-800 select-none cursor-pointer"
          >
            הגבלת פעילות לימים ושעות מסוימים בלבד
          </label>
        </div>

        {useBusinessHours && (
          <div className="space-y-6 pr-8 animate-in fade-in slide-in-from-top-2">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-3">
                ימי פעילות
              </label>
              <div className="flex gap-3 flex-wrap">
                {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((day, idx) => {
                  const isActive = activeDays.includes(idx);
                  // Adjust index so 0=Sunday
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (isActive) {
                          setActiveDays(activeDays.filter((d) => d !== idx));
                        } else {
                          setActiveDays([...activeDays, idx].sort());
                        }
                      }}
                      className={`w-10 h-10 rounded-full text-base font-bold transition-all shadow-sm ${
                        isActive
                          ? "bg-purple-600 text-white shadow-purple-200 scale-110 ring-2 ring-purple-100"
                          : "bg-white text-gray-500 border border-gray-200 hover:border-purple-300 hover:text-purple-600"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  משעה
                </label>
                <div className="relative">
                  <Clock
                    className="absolute top-3 right-3 text-gray-400"
                    size={16}
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-4 py-2 pr-10 bg-white border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  עד שעה
                </label>
                <div className="relative">
                  <Clock
                    className="absolute top-3 right-3 text-gray-400"
                    size={16}
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-4 py-2 pr-10 bg-white border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white/50 p-3 rounded-lg border border-purple-100 text-xs text-purple-800 flex items-start gap-2">
              <CalendarClock size={16} className="shrink-0 mt-0.5" />
              שים לב: במידה ומוגדרים ימי פעילות, האוטומציה לא תפעל כלל מחוץ
              לטווחים האלו, גם אם הטריגר התרחש.
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gray-50 px-8 py-5 border-b border-gray-100 flex justify-between items-center">
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-gray-800">
              {editingRule ? "עריכת אוטומציה" : "אשף האוטומציות"}
            </h3>
            <div className="flex gap-2 mt-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i <= step ? "w-8 bg-blue-600" : "w-2 bg-gray-200"}`}
                />
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 relative min-h-[400px] scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              {renderStep1()}
            </div>
          )}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-white flex justify-between items-center">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
            >
              <ArrowRight size={18} />
              חזור
            </button>
          ) : (
            <div /> // Spacer
          )}

          {step < totalSteps ? (
            <button
              onClick={handleNextStep}
              disabled={
                (step === 1 && !canProceedToStep2) ||
                (step === 2 && !canProceedToStep3()) ||
                (step === 3 && !canSubmit())
              }
              className="px-8 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
            >
              המשך לשלב הבא
              <ArrowLeft size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-8 py-2.5 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all shadow-lg shadow-green-200 flex items-center gap-2"
            >
              {loading && <Loader2 className="animate-spin" size={18} />}
              {editingRule ? "שמור שינויים" : "צור אוטומציה"}
              <CheckCircle2 size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TriggerCard({
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
    <div
      onClick={onClick}
      className={`relative p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 group ${
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
    </div>
  );
}

function formatPhonePreview(phone: string, type: "private" | "group") {
  if (!phone) return "";
  let clean = phone.trim();
  if (type === "group") {
    if (!clean.endsWith("@g.us")) return clean + "@g.us";
    return clean;
  }
  // Private
  clean = clean.replace(/\D/g, "");
  if (clean.startsWith("0")) clean = "972" + clean.substring(1);
  if (!clean.endsWith("@c.us")) clean = clean + "@c.us";
  return clean;
}
