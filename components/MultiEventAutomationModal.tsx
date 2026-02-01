"use client";

import { useState, useEffect } from "react";
import {
  createAutomationRule,
  updateAutomationRule,
} from "@/app/actions/automations";
import { getTableById } from "@/app/actions/tables";
import { getAllFiles } from "@/app/actions/storage";
import {
  X,
  Plus,
  Trash2,
  Bell,
  Database,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ListTodo,
  Timer,
  Smartphone,
  Webhook,
  Copy,
  ChevronDown,
  Loader2,
  Pencil,
} from "lucide-react";

interface MultiEventAutomationModalProps {
  tables: { id: number; name: string }[];
  users?: any[];
  currentUserId: number;
  onClose: () => void;
  onCreated: () => void;
  editingRule?: any;
  userPlan?: string;
}

interface SchemaField {
  name: string;
  type: string;
  label: string;
  options?: string[];
}

export default function MultiEventAutomationModal({
  tables,
  users = [],
  currentUserId,
  onClose,
  onCreated,
  editingRule,
  userPlan = "basic",
}: MultiEventAutomationModalProps) {
  // --- Wizard State ---
  const [step, setStep] = useState(1);
  const totalSteps = 2; // Steps: 1. Event Chain, 2. Actions

  // Calculate max actions based on user plan
  const maxActions = userPlan === "premium" || userPlan === "super" ? 5 : 2;

  // --- General State ---
  const [name, setName] = useState(editingRule?.name || "");
  const [loading, setLoading] = useState(false);

  // --- Step 1: Event Chain State ---
  const [tableId, setTableId] = useState(
    editingRule?.triggerConfig?.tableId || "",
  );
  const [isMultiTableMode, setIsMultiTableMode] = useState(false);
  const [schemas, setSchemas] = useState<Record<string, SchemaField[]>>({});
  const [loadingSchemas, setLoadingSchemas] = useState<Record<string, boolean>>(
    {},
  );
  const [eventChain, setEventChain] = useState<
    Array<{
      id: string;
      tableId: string;
      eventName: string;
      columnName: string;
      value: string;
    }>
  >([
    { id: "1", tableId: "", eventName: "", columnName: "", value: "" },
    { id: "2", tableId: "", eventName: "", columnName: "", value: "" },
  ]);

  // --- Step 2: Action State (Multi actions) ---
  const [actions, setActions] = useState<{ type: string; config: any }[]>(
    () => {
      if (!editingRule) return [];
      if (editingRule.actionType === "MULTI_ACTION") {
        return editingRule.actionConfig?.actions || [];
      }
      return [
        {
          type: editingRule.actionType,
          config: editingRule.actionConfig || {},
        },
      ];
    },
  );

  const [isAddingAction, setIsAddingAction] = useState(actions.length === 0);
  const [currentActionType, setCurrentActionType] = useState<
    | "CALCULATE_MULTI_EVENT_DURATION"
    | "SEND_WHATSAPP"
    | "SEND_NOTIFICATION"
    | "CREATE_TASK"
    | "WEBHOOK"
    | "UPDATE_RECORD_FIELD"
    | ""
  >("");
  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(
    null,
  );

  // Update Record Field Specific
  const [updateFieldColumnId, setUpdateFieldColumnId] = useState("");
  const [updateFieldValue, setUpdateFieldValue] = useState("");

  // --- Temp Config State for Current Action ---
  // Notification / Legacy
  const [recipientId, setRecipientId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(
    "התהליך הושלם בהצלחה.\nמשך: {durationString}",
  );
  const [titleTemplate, setTitleTemplate] = useState("הושלמה שרשרת אירועים");

  // WhatsApp
  const [waPhoneColumnId, setWaPhoneColumnId] = useState("");
  const [waMessageType, setWaMessageType] = useState<
    "private" | "group" | "media"
  >("private");
  const [waContent, setWaContent] = useState("");
  const [waMediaFileId, setWaMediaFileId] = useState("");
  const [availableFiles, setAvailableFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Advanced WhatsApp State
  const [waTargetType, setWaTargetType] = useState<"private" | "group">(
    "private",
  );
  const [showDynamicValues, setShowDynamicValues] = useState(false);
  const [waPhoneMode, setWaPhoneMode] = useState<"column" | "manual">("column");
  const [waDelay, setWaDelay] = useState<string>("");

  // Helper: Count existing WhatsApp actions in the list
  const getExistingWhatsAppCount = () => {
    return actions.filter((a) => a.type === "SEND_WHATSAPP").length;
  };

  // Helper: Get minimum delay required for current WhatsApp action
  const getMinDelayRequired = () => {
    const existingCount = getExistingWhatsAppCount();
    // If editing an existing WhatsApp action, don't count it twice
    const isEditingWhatsApp =
      editingActionIndex !== null &&
      actions[editingActionIndex]?.type === "SEND_WHATSAPP";
    const effectiveCount = isEditingWhatsApp
      ? existingCount - 1
      : existingCount;

    if (effectiveCount === 0) return 0; // First WhatsApp - no delay needed
    if (effectiveCount === 1) return 10; // Second WhatsApp - min 10 seconds
    return 20; // Third or more - min 20 seconds
  };

  // Task
  const [taskTitle, setTaskTitle] = useState("משימה מאוטומציה");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskTags, setTaskTags] = useState<string[]>([]);
  const [taskDueDays, setTaskDueDays] = useState("");
  const [tagInput, setTagInput] = useState("");

  const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (e.type === "keydown" && (e as React.KeyboardEvent).key !== "Enter")
      return;
    e.preventDefault();
    const tag = tagInput.trim();
    if (tag && !taskTags.includes(tag)) {
      setTaskTags([...taskTags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTaskTags(taskTags.filter((t) => t !== tagToRemove));
  };

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState("");

  // --- Validation Error ---
  const [validationError, setValidationError] = useState<string | null>(null);

  // --- Effects ---

  // Load Schema
  const loadTableSchema = async (tid: string) => {
    if (!tid || schemas[tid] || loadingSchemas[tid]) return;

    setLoadingSchemas((prev) => ({ ...prev, [tid]: true }));
    try {
      const result = await getTableById(Number(tid));
      if (
        result.success &&
        result.data &&
        Array.isArray(result.data.schemaJson)
      ) {
        setSchemas((prev) => ({
          ...prev,
          [tid]: result.data.schemaJson as any,
        }));
      } else {
        setSchemas((prev) => ({ ...prev, [tid]: [] }));
      }
    } catch (error) {
      console.error(`Failed to load schema for table ${tid}`, error);
      setSchemas((prev) => ({ ...prev, [tid]: [] }));
    } finally {
      setLoadingSchemas((prev) => ({ ...prev, [tid]: false }));
    }
  };

  // Load Files for WhatsApp
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

  // Init Editing Rule
  useEffect(() => {
    if (editingRule) {
      const config = editingRule.triggerConfig;
      if (config) {
        const mainTableId = String(config.tableId || "");
        setTableId(mainTableId);
        loadTableSchema(mainTableId);

        if (Array.isArray(config.eventChain)) {
          const usedTableIds = new Set<string>();
          const chain = config.eventChain.map((e: any, index: number) => {
            const tId = String(e.tableId || mainTableId);
            usedTableIds.add(tId);
            return {
              id: String(Date.now() + index),
              tableId: tId,
              eventName: e.eventName || "",
              columnName: e.columnId || userIdFix(e.columnId), // fix old names if needed
              value: e.value || "",
            };
          });

          setEventChain(chain);
          if (usedTableIds.size > 1) {
            setIsMultiTableMode(true);
          }
          usedTableIds.forEach((id) => loadTableSchema(id));
        }

        // Restore WhatsApp State
        if (
          config.actionType === "SEND_WHATSAPP" ||
          editingRule.actionType === "SEND_WHATSAPP"
        ) {
          const phoneCol = editingRule.actionConfig?.phoneColumnId || "";
          if (phoneCol.includes("@g.us")) {
            setWaTargetType("group");
          } else {
            setWaTargetType("private");
          }

          if (phoneCol.startsWith("manual:")) {
            setWaPhoneMode("manual");
          } else {
            setWaPhoneMode("column");
          }
        }
      }
    }
  }, [editingRule]);

  const userIdFix = (col: string) => col;

  // Sync Table ID
  useEffect(() => {
    if (tableId) {
      loadTableSchema(tableId);
      if (!isMultiTableMode) {
        setEventChain((prev) => prev.map((e) => ({ ...e, tableId })));
      }
    }
  }, [tableId, isMultiTableMode]);

  // Validation Logic
  useEffect(() => {
    if (!name) return;
    if (!tableId) return;

    // basic chain validation
    let isValid = true;
    eventChain.forEach((e) => {
      if (!e.eventName || !e.columnName) isValid = false;
    });

    if (!isValid) {
      setValidationError("יש למלא את כל השדות בשרשרת האירועים");
      return;
    }

    if (!isMultiTableMode) {
      setValidationError(null);
      return;
    }

    const checkRelations = () => {
      for (let i = 0; i < eventChain.length - 1; i++) {
        const current = eventChain[i];
        const next = eventChain[i + 1];

        const t1 = current.tableId || tableId;
        const t2 = next.tableId || tableId;

        if (t1 === t2) continue;
        if (!t1 || !t2) continue;

        const schema1 = schemas[t1];
        const schema2 = schemas[t2];

        if (!schema1 || !schema2) return;

        const hasRel1to2 = schema1.some(
          (f: any) =>
            f.type === "relation" && Number(f.relationTableId) === Number(t2),
        );
        const hasRel2to1 = schema2.some(
          (f: any) =>
            f.type === "relation" && Number(f.relationTableId) === Number(t1),
        );

        if (!hasRel1to2 && !hasRel2to1) {
          setValidationError(
            `חסר קשר (Relation) בין שלב ${i + 1} (${current.eventName}) לשלב ${
              i + 2
            } (${next.eventName}). חובה לקשר בין הטבלאות.`,
          );
          return;
        }
      }
      setValidationError(null);
    };

    checkRelations();
  }, [eventChain, schemas, isMultiTableMode, tableId, name]);

  // --- Handlers ---

  const addEvent = () => {
    setEventChain([
      ...eventChain,
      {
        id: Date.now().toString(),
        tableId: isMultiTableMode ? "" : tableId,
        eventName: "",
        columnName: "",
        value: "",
      },
    ]);
  };

  const removeEvent = (id: string) => {
    if (eventChain.length > 2) {
      setEventChain(eventChain.filter((e) => e.id !== id));
    }
  };

  const updateEvent = (
    id: string,
    field: "tableId" | "eventName" | "columnName" | "value",
    newValue: string,
  ) => {
    setEventChain(
      eventChain.map((e) => {
        if (e.id !== id) return e;

        if (field === "tableId") {
          loadTableSchema(newValue);
          return { ...e, tableId: newValue, columnName: "", value: "" };
        }
        if (field === "columnName") {
          return { ...e, columnName: newValue, value: "" };
        }
        return { ...e, [field]: newValue };
      }),
    );
  };

  const getColumnsForEvent = (tId: string) => {
    return schemas[tId] || [];
  };

  // --- Action Management ---
  const validateCurrentAction = () => {
    if (!currentActionType) return false;
    if (currentActionType === "SEND_NOTIFICATION")
      return !!recipientId && !!messageTemplate;
    if (currentActionType === "SEND_WHATSAPP") {
      if (!waPhoneColumnId && waPhoneMode === "column") return false;
      if (!waContent && waMessageType !== "media") return false;
      if (waMessageType === "media" && !waMediaFileId) return false;
      // Check delay requirement
      const minDelay = getMinDelayRequired();
      if (minDelay > 0) {
        if (!waDelay || Number(waDelay) < minDelay) return false;
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
      return !!updateFieldColumnId && !!updateFieldValue;
    }
    if (currentActionType === "CALCULATE_MULTI_EVENT_DURATION") return true;
    return false;
  };

  const handleConfirmAction = () => {
    if (!validateCurrentAction()) return;

    let config: any = {};
    if (currentActionType === "SEND_WHATSAPP") {
      config = {
        phoneColumnId: waPhoneColumnId,
        messageType: waMessageType,
        content: waContent,
        mediaFileId: waMediaFileId ? Number(waMediaFileId) : null,
        delay: waDelay ? Number(waDelay) : undefined,
      };
    } else if (currentActionType === "WEBHOOK") {
      config = { webhookUrl };
    } else if (currentActionType === "CREATE_TASK") {
      config = {
        title: taskTitle,
        description: taskDesc,
        status: taskStatus,
        priority: taskPriority,
        assigneeId: taskAssignee,
        tags: taskTags,
        dueDays: taskDueDays ? Number(taskDueDays) : undefined,
      };
    } else if (currentActionType === "UPDATE_RECORD_FIELD") {
      config = {
        columnId: updateFieldColumnId,
        value: updateFieldValue,
      };
    } else {
      // Notification / Calc
      config = {
        recipientId,
        messageTemplate,
        titleTemplate,
      };
    }

    const actionObj = { type: currentActionType, config };

    if (editingActionIndex !== null) {
      const newActions = [...actions];
      newActions[editingActionIndex] = actionObj;
      setActions(newActions);
      setEditingActionIndex(null);
    } else {
      setActions([...actions, actionObj]);
    }

    // Reset
    setIsAddingAction(false);
    setCurrentActionType("");
    setRecipientId("");
    setMessageTemplate("התהליך הושלם בהצלחה.\nמשך: {durationString}");
    setWaPhoneColumnId("");
    setWaContent("");
    setWaMediaFileId("");
    setWaDelay("");
    setWebhookUrl("");
    setTaskTitle("משימה מאוטומציה");
    setTaskDesc("");
    setTaskStatus("todo");
    setTaskPriority("medium");
    setTaskAssignee("");
    setTaskTags([]);
    setTaskDueDays("");
    setUpdateFieldColumnId("");
    setUpdateFieldValue("");
  };

  const editAction = (index: number) => {
    const action = actions[index];
    // @ts-ignore
    setCurrentActionType(action.type);

    const conf = action.config;
    if (
      action.type === "SEND_NOTIFICATION" ||
      action.type === "CALCULATE_MULTI_EVENT_DURATION"
    ) {
      setRecipientId(conf.recipientId?.toString() || "");
      setMessageTemplate(conf.messageTemplate || "");
      setTitleTemplate(conf.titleTemplate || "");
    } else if (action.type === "SEND_WHATSAPP") {
      setWaPhoneColumnId(conf.phoneColumnId || "");
      setWaTargetType(
        conf.phoneColumnId?.includes("@g.us") ? "group" : "private",
      );
      setWaMessageType(conf.messageType || "private");
      setWaContent(conf.content || "");
      setWaMediaFileId(conf.mediaFileId?.toString() || "");
      setWaPhoneMode(
        conf.phoneColumnId?.startsWith("manual:") ? "manual" : "column",
      );
      setWaDelay(conf.delay?.toString() || "");
    } else if (action.type === "WEBHOOK") {
      setWebhookUrl(conf.webhookUrl || "");
    } else if (action.type === "CREATE_TASK") {
      setTaskTitle(conf.title || "");
      setTaskDesc(conf.description || "");
      setTaskStatus(conf.status || "todo");
      setTaskPriority(conf.priority || "medium");
      setTaskAssignee(conf.assigneeId?.toString() || "");
      setTaskTags(conf.tags || []);
      setTaskDueDays(conf.dueDays?.toString() || "");
    } else if (action.type === "UPDATE_RECORD_FIELD") {
      setUpdateFieldColumnId(conf.columnId || "");
      setUpdateFieldValue(conf.value || "");
    }

    setEditingActionIndex(index);
    setIsAddingAction(true);
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

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const formattedEventChain = eventChain.map((event) => ({
        eventName: event.eventName,
        columnId: event.columnName,
        value: event.value,
        tableId: event.tableId || tableId,
      }));

      // Determine Final Action Payload
      let finalActionType = "";
      let finalActionConfig = {};

      if (actions.length > 1) {
        finalActionType = "MULTI_ACTION";
        finalActionConfig = { actions };
      } else if (actions.length === 1) {
        finalActionType = actions[0].type;
        finalActionConfig = actions[0].config;
      } else {
        // If user is inside "Add Action" screen and clicks Save, we should probably try to save current action
        if (isAddingAction && validateCurrentAction()) {
          handleConfirmAction();
          // Re-reun submit? No, handleConfirmAction is async state update.
          // We can't easily sync wait.
          // Better to force user to click "Confirm Action" first.
          alert("אנא אשר את הפעולה הנוכחית לפני השמירה");
          setLoading(false);
          return;
        }
        alert("נא להגדיר לפחות פעולה אחת");
        setLoading(false);
        return;
      }

      const ruleData = {
        name,
        triggerType: "MULTI_EVENT_DURATION",
        triggerConfig: {
          tableId,
          eventChain: formattedEventChain,
        },
        actionType: finalActionType,
        actionConfig: finalActionConfig,
      };

      let result;
      if (editingRule) {
        result = await updateAutomationRule(editingRule.id, ruleData);
      } else {
        result = await createAutomationRule(ruleData);
      }

      if (result.success) {
        onCreated();
        onClose();
      } else {
        alert("שגיאה בשמירת האוטומציה");
      }
    } catch (error) {
      console.error(error);
      alert("שגיאה");
    } finally {
      setLoading(false);
    }
  };

  // --- Render Steps ---

  const renderStep1 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6">
        <h3 className="font-bold text-blue-900 flex items-center gap-2 mb-2">
          <Timer className="w-5 h-5" />
          הגדרת שרשרת האירועים
        </h3>
        <p className="text-sm text-blue-800">
          כאן נגדיר את רצף האירועים שנרצה למדוד ולפעול לפיהם. המערכת תזהה מתי
          הרצף הושלם ותפעיל את הפעולה הרצויה.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            שם האוטומציה
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="לדוגמה: זמן המרה מליד ללקוח"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            טבלה ראשית
          </label>
          <div className="flex gap-2">
            <select
              required
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">בחר טבלה...</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setIsMultiTableMode(!isMultiTableMode)}
              className={`px-3 py-2 rounded-lg border flex items-center gap-2 text-sm font-medium transition ${
                isMultiTableMode
                  ? "bg-purple-100 border-purple-300 text-purple-700"
                  : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
              title="אפשר בחירת טבלה שונה לכל שלב בשרשרת"
            >
              <Database size={16} />
              {isMultiTableMode ? "מצב מורכב פעיל" : "מצב רגיל"}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 mt-6">
        {eventChain.map((event, index) => {
          const currentTableId = isMultiTableMode ? event.tableId : tableId;
          const currentColumns = getColumnsForEvent(currentTableId);
          const selectedColumn = currentColumns.find(
            (c) => c.name === event.columnName,
          );
          const hasOptions =
            selectedColumn &&
            (selectedColumn.type === "select" ||
              selectedColumn.type === "multiSelect" || // fix type name
              selectedColumn.type === "multi-select" ||
              selectedColumn.type === "radio" ||
              selectedColumn.type === "status");
          const isBoolean = selectedColumn && selectedColumn.type === "boolean";

          return (
            <div
              key={event.id}
              className="relative pl-8 pb-8 last:pb-0 border-l-2 border-dashed border-gray-300 last:border-0"
            >
              {/* Timeline Dot */}
              <div
                className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm
                           ${index === 0 ? "bg-green-500" : index === eventChain.length - 1 ? "bg-red-500" : "bg-yellow-500"}
                       `}
              />

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-blue-300 transition group relative">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {index === 0 ? "התחלה" : `שלב ${index + 1}`}
                  </span>
                  {eventChain.length > 2 && (
                    <button
                      onClick={() => removeEvent(event.id)}
                      className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    type="text"
                    placeholder="שם האירוע (לדוגמה: יצירת ליד)"
                    value={event.eventName}
                    onChange={(e) =>
                      updateEvent(event.id, "eventName", e.target.value)
                    }
                    className="px-3 py-2 border rounded-lg text-sm bg-gray-50 focus:bg-white transition"
                  />

                  {isMultiTableMode && (
                    <select
                      value={event.tableId}
                      onChange={(e) =>
                        updateEvent(event.id, "tableId", e.target.value)
                      }
                      className="px-3 py-2 border rounded-lg text-sm bg-white"
                    >
                      <option value="">בחר טבלה...</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <select
                    value={event.columnName}
                    onChange={(e) =>
                      updateEvent(event.id, "columnName", e.target.value)
                    }
                    className="px-3 py-2 border rounded-lg text-sm bg-white"
                    disabled={!currentTableId}
                  >
                    <option value="">בחר עמודה...</option>
                    {currentColumns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.label || c.name}
                      </option>
                    ))}
                  </select>

                  {isBoolean ? (
                    <select
                      value={event.value}
                      onChange={(e) =>
                        updateEvent(event.id, "value", e.target.value)
                      }
                      className="px-3 py-2 border rounded-lg text-sm bg-white"
                    >
                      <option value="">בחר...</option>
                      <option value="true">כן / פעיל</option>
                      <option value="false">לא / כבוי</option>
                    </select>
                  ) : hasOptions ? (
                    <select
                      value={event.value}
                      onChange={(e) =>
                        updateEvent(event.id, "value", e.target.value)
                      }
                      className="px-3 py-2 border rounded-lg text-sm bg-white"
                    >
                      <option value="">בחר...</option>
                      {selectedColumn.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="ערך..."
                      value={event.value}
                      onChange={(e) =>
                        updateEvent(event.id, "value", e.target.value)
                      }
                      className="px-3 py-2 border rounded-lg text-sm"
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addEvent}
          className="mr-8 flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          הוסף שלב נוסף
        </button>
      </div>

      {validationError && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm border border-red-200 flex items-center gap-2">
          ⚠️ {validationError}
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <div className="text-center mb-4">
        <h3 className="text-xl font-bold text-gray-900">
          מה לעשות כשהתהליך מסתיים?
        </h3>
        <p className="text-gray-500 mt-1">
          הגדר את הפעולות שיתבצעו בסיום שרשרת האירועים (עד {maxActions} פעולות)
        </p>
      </div>

      {isAddingAction ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 border-2 border-blue-100 rounded-xl p-6 bg-white shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-bold text-blue-900 flex items-center gap-2">
              {editingActionIndex !== null ? (
                <Pencil size={18} />
              ) : (
                <Plus size={18} />
              )}
              {editingActionIndex !== null ? "עריכת פעולה" : "הוספת פעולה חדשה"}
            </h4>
            {actions.length > 0 && (
              <button
                onClick={() => {
                  setIsAddingAction(false);
                  setEditingActionIndex(null);
                  setCurrentActionType("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {!currentActionType ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ActionCard
                title="חישוב בלבד + התראה"
                desc="שמור את נתוני הזמנים ושלח התראה למשתמש"
                icon={<Timer className="text-blue-500" />}
                selected={false}
                onClick={() =>
                  setCurrentActionType("CALCULATE_MULTI_EVENT_DURATION")
                }
              />
              <ActionCard
                title="שלח הודעת WhatsApp"
                desc="שלח הודעה או קובץ לנמען באופן אוטומטי"
                icon={<Smartphone className="text-green-500" />}
                selected={false}
                onClick={() => setCurrentActionType("SEND_WHATSAPP")}
              />
              <ActionCard
                title="צור משימה חדשה"
                desc="פתח משימה חדשה במערכת להמשך טיפול"
                icon={<ListTodo className="text-purple-500" />}
                selected={false}
                onClick={() => setCurrentActionType("CREATE_TASK")}
              />
              <ActionCard
                title="שלח Webhook"
                desc="שלח את הנתונים למערכת חיצונית (Make, Zapier)"
                icon={<Webhook className="text-orange-500" />}
                selected={false}
                onClick={() => setCurrentActionType("WEBHOOK")}
              />
              <ActionCard
                title="שלח התראה רגילה"
                desc="שלח התראה למשתמש מערכת (בלי דגש על חישוב)"
                icon={<Bell className="text-yellow-500" />}
                selected={false}
                onClick={() => setCurrentActionType("SEND_NOTIFICATION")}
              />
              <ActionCard
                title="עדכון שדה ברשומה"
                desc="עדכן ערך באופן אוטומטי כשמתקיים התהליך"
                icon={<Pencil className="text-purple-500" />}
                selected={false}
                onClick={() => setCurrentActionType("UPDATE_RECORD_FIELD")}
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4 bg-gray-50 p-2 rounded-lg inline-flex">
                <button
                  onClick={() => setCurrentActionType("")}
                  className="text-sm text-gray-500 hover:text-blue-600 flex items-center gap-1"
                >
                  <ArrowRight size={14} /> החלף סוג פעולה
                </button>
                <span className="text-gray-300">|</span>
                <span className="text-sm font-bold text-gray-800">
                  {currentActionType === "CALCULATE_MULTI_EVENT_DURATION" &&
                    "חישוב והתראה"}
                  {currentActionType === "SEND_WHATSAPP" && "שליחת WhatsApp"}
                  {currentActionType === "CREATE_TASK" && "יצירת משימה"}
                  {currentActionType === "WEBHOOK" && "Webhook"}
                  {currentActionType === "SEND_NOTIFICATION" && "התראה"}
                  {currentActionType === "UPDATE_RECORD_FIELD" && "עדכון שדה"}
                </span>
              </div>

              {/* WhatsApp Config */}
              {currentActionType === "SEND_WHATSAPP" && (
                <div key="wa-config" className="space-y-6 animate-in fade-in">
                  {/* Reuse existing WA config UI code */}
                  <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                    <h4 className="font-bold text-green-800 flex items-center gap-2">
                      <Smartphone size={18} />
                      הגדרות וואטסאפ
                    </h4>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      למי לשלוח?
                    </label>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setWaTargetType("private")}
                        className={`flex-1 p-3 rounded-lg border text-center transition ${waTargetType === "private" ? "bg-blue-50 border-blue-500 text-blue-700 font-bold" : "bg-white border-gray-200 text-gray-600"}`}
                      >
                        אישי (Private)
                      </button>
                      <button
                        type="button"
                        onClick={() => setWaTargetType("group")}
                        className={`flex-1 p-3 rounded-lg border text-center transition ${waTargetType === "group" ? "bg-blue-50 border-blue-500 text-blue-700 font-bold" : "bg-white border-gray-200 text-gray-600"}`}
                      >
                        קבוצה (Group)
                      </button>
                    </div>
                  </div>

                  {/* Phone Configuration */}
                  {waTargetType === "private" ? (
                    <div className="space-y-3">
                      <div className="flex text-sm bg-gray-100 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => setWaPhoneMode("column")}
                          className={`flex-1 py-1.5 rounded-md transition ${waPhoneMode === "column" ? "bg-white shadow text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          מתוך עמודה
                        </button>
                        <button
                          type="button"
                          onClick={() => setWaPhoneMode("manual")}
                          className={`flex-1 py-1.5 rounded-md transition ${waPhoneMode === "manual" ? "bg-white shadow text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          מספר קבוע
                        </button>
                      </div>

                      {waPhoneMode === "column" ? (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            בחר עמודת טלפון
                          </label>
                          <select
                            value={
                              waPhoneColumnId.startsWith("manual:")
                                ? ""
                                : waPhoneColumnId
                            }
                            onChange={(e) => setWaPhoneColumnId(e.target.value)}
                            className="w-full px-4 py-2 border rounded-lg bg-white"
                          >
                            <option value="">בחר עמודה...</option>
                            {getColumnsForEvent(tableId).map((col: any) => (
                              <option key={col.id || col.name} value={col.name}>
                                {col.label || col.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            הזן מספר טלפון
                          </label>
                          <input
                            type="text"
                            value={waPhoneColumnId.replace("manual:", "")}
                            onChange={(e) =>
                              setWaPhoneColumnId(`manual:${e.target.value}`)
                            }
                            placeholder="0501234567"
                            className="w-full px-4 py-2 border rounded-lg ltr text-left"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        מזהה קבוצה (Group ID)
                      </label>
                      <input
                        type="text"
                        value={waPhoneColumnId.replace("manual:", "")}
                        onChange={(e) =>
                          setWaPhoneColumnId(`manual:${e.target.value}`)
                        }
                        placeholder="Example: 12036304@g.us"
                        className="w-full px-4 py-2 border rounded-lg ltr text-left font-mono"
                      />
                    </div>
                  )}

                  {/* Delay/Sleep Section - Only show if there's already another WhatsApp action */}
                  {getMinDelayRequired() > 0 && (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 animate-in fade-in">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                          <Timer className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-amber-800 text-sm mb-1">
                            השהייה לפני שליחה (חובה)
                          </h4>
                          <p className="text-xs text-amber-600 mb-3">
                            על מנת לא להיחסם על ידי Green API, יש להמתין לפחות{" "}
                            {getMinDelayRequired()} שניות בין הודעות WhatsApp.
                          </p>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min={getMinDelayRequired()}
                              value={waDelay}
                              onChange={(e) => setWaDelay(e.target.value)}
                              placeholder={`מינימום ${getMinDelayRequired()}`}
                              className="w-32 px-3 py-2 border border-amber-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                            />
                            <span className="text-sm text-amber-700 font-medium">
                              שניות
                            </span>
                          </div>
                          {waDelay &&
                            Number(waDelay) < getMinDelayRequired() && (
                              <p className="text-xs text-red-600 mt-2 font-medium">
                                ⚠️ ערך מינימלי: {getMinDelayRequired()} שניות
                              </p>
                            )}
                        </div>
                      </div>
                    </div>
                  )}

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
                          הודעה רגילה (טקסט)
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
                      value={waContent}
                      onChange={(e) => setWaContent(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder="היי {Name}, התהליך הסתיים..."
                    />
                    <div className="mt-2">
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
                          <div className="col-span-2 bg-purple-50 text-purple-800 text-[11px] p-2 rounded mb-1 border border-purple-100 leading-tight">
                            <strong>משתנה מחושב:</strong> {`{durationString}`}{" "}
                            מייצג את משך הזמן הכולל של התהליך בפורמט טקסט קריא.
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`{durationString}`);
                            }}
                            className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded text-xs hover:border-purple-300 hover:bg-purple-50 transition-colors group"
                            title="משך זמן כולל מחושב (בפורמט טקסט)"
                          >
                            <span
                              className="font-bold text-purple-700"
                              dir="ltr"
                            >
                              {`{durationString}`}
                            </span>
                            <Copy
                              size={12}
                              className="text-gray-400 group-hover:text-purple-500"
                            />
                          </button>
                          {getColumnsForEvent(tableId).map((col: any) => (
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
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Notification / Calc Config */}
              {(currentActionType === "CALCULATE_MULTI_EVENT_DURATION" ||
                currentActionType === "SEND_NOTIFICATION") && (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-4">
                    <h4 className="font-bold text-blue-800 flex items-center gap-2">
                      <Bell size={18} />
                      הגדרות התראה
                    </h4>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      למי לשלוח?
                    </label>
                    <select
                      value={recipientId}
                      onChange={(e) => setRecipientId(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg bg-white"
                    >
                      <option value="">בחר משתמש...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      כותרת
                    </label>
                    <input
                      type="text"
                      value={titleTemplate}
                      onChange={(e) => setTitleTemplate(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      תוכן
                    </label>
                    <textarea
                      value={messageTemplate}
                      onChange={(e) => setMessageTemplate(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* Create Task Config */}
              {currentActionType === "CREATE_TASK" && (
                <div className="space-y-4">
                  <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 mb-4">
                    <h4 className="font-bold text-purple-800 flex items-center gap-2">
                      <ListTodo size={18} />
                      הגדרות משימה חדשה
                    </h4>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      כותרת המשימה
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="שם המשימה"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      תיאור
                    </label>
                    <textarea
                      placeholder="תיאור (אופציונלי)"
                      value={taskDesc}
                      onChange={(e) => setTaskDesc(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ימים לביצוע (מהיצירה)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="לדוגמה: 3"
                        value={taskDueDays}
                        onChange={(e) => setTaskDueDays(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        סטטוס התחלתי
                      </label>
                      <select
                        value={taskStatus}
                        onChange={(e) => setTaskStatus(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      >
                        <option value="todo">משימות</option>
                        <option value="in_progress">משימות בטיפול</option>
                        <option value="waiting_client">
                          ממתינים לאישור לקוח
                        </option>
                        <option value="on_hold">משימות בהשהייה</option>
                        <option value="completed_month">בוצעו החודש</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        עדיפות
                      </label>
                      <select
                        value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      >
                        <option value="high">גבוה</option>
                        <option value="medium">בינוני</option>
                        <option value="low">נמוך</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        אחראי
                      </label>
                      <select
                        value={taskAssignee}
                        onChange={(e) => setTaskAssignee(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      >
                        <option value="">ללא שיוך</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      תגיות
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleAddTag}
                        placeholder="הקלד תגית ולחץ Enter"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors text-sm border border-gray-300"
                      >
                        הוסף
                      </button>
                    </div>
                    {taskTags.length > 0 && (
                      <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                        {taskTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs border border-purple-200"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="hover:text-purple-900 transition-colors w-4 h-4 flex items-center justify-center rounded-full hover:bg-purple-200"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Webhook Config */}
              {currentActionType === "WEBHOOK" && (
                <div className="space-y-4">
                  <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 mb-4">
                    <h4 className="font-bold text-orange-800 flex items-center gap-2">
                      <Webhook size={18} />
                      הגדרות Webhook
                    </h4>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      כתובת ה-URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://hook.eu1.make.com/..."
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg text-left ltr"
                    />
                  </div>
                </div>
              )}

              {/* Update Record Field Config */}
              {currentActionType === "UPDATE_RECORD_FIELD" && (
                <div className="space-y-4">
                  <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 mb-4">
                    <h4 className="font-bold text-purple-800 flex items-center gap-2">
                      <Pencil size={18} />
                      הגדרות עדכון שדה
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        בחר שדה לעדכון
                      </label>
                      <select
                        value={updateFieldColumnId}
                        onChange={(e) => setUpdateFieldColumnId(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg bg-white"
                      >
                        <option value="">בחר עמודה...</option>
                        {getColumnsForEvent(tableId).map((col: any) => (
                          <option key={col.id || col.name} value={col.name}>
                            {col.label || col.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ערך חדש
                      </label>
                      <input
                        type="text"
                        value={updateFieldValue}
                        onChange={(e) => setUpdateFieldValue(e.target.value)}
                        placeholder="הזן ערך..."
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="bg-purple-100/50 p-3 rounded-lg text-sm text-purple-700">
                    <strong>שים לב:</strong> כאשר האוטומציה תפעל, השדה שתבחר
                    יעודכן אוטומטית לערך שתגדיר.
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-6">
                <button
                  onClick={handleConfirmAction}
                  disabled={!validateCurrentAction()}
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {editingActionIndex !== null ? "שמור שינויים" : "הוסף פעולה"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {actions.length === 0 && (
            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
              <p className="text-gray-500">טרם הוגדרו פעולות</p>
              <button
                onClick={() => setIsAddingAction(true)}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium inline-flex items-center gap-2"
              >
                <Plus size={16} /> הוסף פעולה ראשונה
              </button>
            </div>
          )}

          {actions.map((action, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 border rounded-xl bg-white shadow-sm hover:border-blue-300 transition group"
            >
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                  {index + 1}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">
                    {action.type === "CALCULATE_MULTI_EVENT_DURATION" &&
                      "חישוב והתראה"}
                    {action.type === "SEND_WHATSAPP" && "שליחת הודעת WhatsApp"}
                    {action.type === "CREATE_TASK" && "יצירת משימה חדשה"}
                    {action.type === "WEBHOOK" && "שליחת Webhook"}
                    {action.type === "SEND_NOTIFICATION" && "התראה למערכת"}
                    {action.type === "UPDATE_RECORD_FIELD" &&
                      "עדכון שדה ברשומה"}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1 truncate max-w-[300px]">
                    {JSON.stringify(action.config).slice(0, 50)}...
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => editAction(index)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
                >
                  <Pencil size={18} />
                </button>
                <button
                  onClick={() => removeAction(index)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}

          {actions.length > 0 && actions.length < maxActions && (
            <button
              onClick={() => setIsAddingAction(true)}
              className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition flex items-center justify-center gap-2 font-medium"
            >
              <Plus size={20} />
              הוסף פעולה נוספת ({actions.length}/{maxActions})
            </button>
          )}

          {actions.length >= maxActions && (
            <div className="bg-yellow-50 text-yellow-800 text-sm p-3 rounded-lg text-center font-medium">
              הגעת למגבלת הפעולות ({maxActions})
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl min-h-[600px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-200 p-6 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              אשף אוטומציה מרובת שלבים
            </h2>
            <div className="flex items-center gap-2 mt-2">
              {[1, 2].map((s) => (
                <div
                  key={s}
                  className={`flex items-center gap-1 text-sm ${step >= s ? "text-blue-600 font-medium" : "text-gray-400"}`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border ${step >= s ? "bg-blue-100 border-blue-600" : "border-gray-300"}`}
                  >
                    {step > s ? <CheckCircle2 size={14} /> : s}
                  </div>
                  <span>
                    {s === 1 && "הגדרת רצף"}
                    {s === 2 && "פעולות ושמירה"}
                  </span>
                  {s < 2 && <div className="w-4 h-px bg-gray-300 mx-2" />}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-200 transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between shrink-0">
          {step > 1 ? (
            <button
              onClick={() => {
                // If user is in the middle of adding an action, try to save it first
                if (isAddingAction && currentActionType) {
                  if (validateCurrentAction()) {
                    // Auto-save the action
                    handleConfirmAction();
                    // Show success message
                    alert("הפעולה נשמרה אוטומטית");
                  } else {
                    // Ask user if they want to discard
                    const confirmDiscard = confirm(
                      "יש פעולה שלא הושלמה. האם לבטל אותה ולחזור?",
                    );
                    if (!confirmDiscard) {
                      return; // Don't go back
                    }
                    // Reset the adding state
                    setIsAddingAction(actions.length === 0);
                    setCurrentActionType("");
                    setEditingActionIndex(null);
                  }
                }
                setStep(step - 1);
              }}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-white transition"
            >
              <ArrowRight size={18} />
              חזור
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-white transition"
              disabled={loading}
            >
              ביטול
            </button>
          )}

          {step < totalSteps ? (
            <button
              onClick={() => {
                if (step === 1 && !name) {
                  alert("אנא הזן שם לאוטומציה");
                  return;
                }
                if (step === 1 && validationError) return;

                // When moving to step 2, if there are already saved actions, show the list
                if (step === 1 && actions.length > 0) {
                  setIsAddingAction(false);
                  setCurrentActionType("");
                  setEditingActionIndex(null);
                }

                setStep(step + 1);
              }}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 shadow-lg shadow-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={step === 1 && validationError !== null}
            >
              המשך
              <ArrowLeft size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 shadow-lg shadow-green-200 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  סיום ושמירה
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-component for Action Card
function ActionCard({ title, desc, icon, selected, onClick }: any) {
  return (
    <div
      onClick={onClick}
      className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 hover:shadow-md ${
        selected
          ? "border-blue-500 bg-blue-50"
          : "border-gray-100 bg-white hover:border-blue-200"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`p-3 rounded-xl ${
            selected ? "bg-white shadow-sm" : "bg-gray-50"
          }`}
        >
          {icon}
        </div>
        <div>
          <h4
            className={`font-semibold mb-1 ${
              selected ? "text-blue-900" : "text-gray-900"
            }`}
          >
            {title}
          </h4>
          <p
            className={`text-sm leading-relaxed ${
              selected ? "text-blue-700" : "text-gray-500"
            }`}
          >
            {desc}
          </p>
        </div>
      </div>
      {selected && (
        <div className="absolute top-4 left-4 text-blue-500">
          <CheckCircle2 size={24} className="fill-blue-100" />
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
