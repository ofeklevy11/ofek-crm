"use client";

import { useState, useEffect } from "react";
import {
  createAutomationRule,
  updateAutomationRule,
} from "@/app/actions/automations";
import { getAllFiles } from "@/app/actions/storage";
import {
  X,
  Loader2,
  Bell,
  MessageSquare,
  Timer,
  CheckCircle2,
  ChevronDown,
  Copy,
  Pencil,
  CheckSquare,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Clock,
  Zap,
  Shield,
} from "lucide-react";

interface User {
  id: number;
  name: string;
}

interface SlaAutomationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: User[];
  initialData?: any;
  userPlan?: string;
}

type ActionType =
  | "SEND_NOTIFICATION"
  | "SEND_WHATSAPP"
  | "WEBHOOK"
  | "CREATE_TASK"
  | "";

export default function SlaAutomationModal({
  open,
  onOpenChange,
  users,
  initialData,
  userPlan = "basic",
}: SlaAutomationModalProps) {
  // Wizard State
  const [step, setStep] = useState(1);
  const totalSteps = 3;

  // Calculate max actions based on user plan
  const maxActions = userPlan === "premium" || userPlan === "super" ? 6 : 2;

  // Form State
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<
    "TICKET_STATUS_CHANGE" | "SLA_BREACH"
  >("SLA_BREACH");

  // Status Change Config
  const [fromStatus, setFromStatus] = useState("any");
  const [toStatus, setToStatus] = useState("any");

  // SLA Breach Config
  const [slaPriority, setSlaPriority] = useState("any");
  const [slaBreachType, setSlaBreachType] = useState<
    "any" | "RESPONSE" | "RESOLVE"
  >("any");

  // Actions State
  const [actions, setActions] = useState<{ type: string; config: any }[]>([]);
  const [isAddingAction, setIsAddingAction] = useState(true);
  const [currentActionType, setCurrentActionType] = useState<ActionType>("");
  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(
    null,
  );

  // Action Config States
  const [recipientId, setRecipientId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(
    "הקריאה {ticketTitle} חרגה מ{breachType}! עדיפות: {priority}",
  );

  // WhatsApp Specific
  const [waTargetType, setWaTargetType] = useState<"private" | "group">(
    "private",
  );
  const [waPhoneColumnId, setWaPhoneColumnId] = useState("");
  const [waMessageType, setWaMessageType] = useState<"private" | "media">(
    "private",
  );
  const [waContent, setWaContent] = useState("");
  const [waMediaFileId, setWaMediaFileId] = useState("");
  const [waDelay, setWaDelay] = useState(0);

  // Webhook Specific
  const [webhookUrl, setWebhookUrl] = useState("");

  // Create Task Specific
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [taskPriority, setTaskPriority] = useState("high");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [taskDueDays, setTaskDueDays] = useState(0);
  const [taskTags, setTaskTags] = useState<string[]>([]);
  const [taskTagInput, setTaskTagInput] = useState("");

  // Files for WhatsApp media
  const [availableFiles, setAvailableFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize from initialData
  useEffect(() => {
    if (open && initialData && !initialized) {
      setTriggerType(initialData.triggerType || "SLA_BREACH");
      const tc = initialData.triggerConfig || {};
      setFromStatus(tc.fromStatus || "any");
      setToStatus(tc.toStatus || "any");
      setSlaPriority(tc.priority || "any");
      setSlaBreachType(tc.breachType || "any");
      setName(initialData.name || "");

      // Load actions
      if (initialData.actionType === "MULTI_ACTION") {
        setActions(initialData.actionConfig?.actions || []);
        setIsAddingAction(false);
      } else if (initialData.actionType) {
        setActions([
          {
            type: initialData.actionType,
            config: initialData.actionConfig || {},
          },
        ]);
        setIsAddingAction(false);
      }
      setInitialized(true);
    } else if (open && !initialData && !initialized) {
      // Reset for new
      resetForm();
      setInitialized(true);
    }
  }, [open, initialData, initialized]);

  useEffect(() => {
    if (!open && initialized) {
      setInitialized(false);
      setStep(1);
    }
  }, [open, initialized]);

  // Load files when WhatsApp media is selected
  useEffect(() => {
    if (waMessageType === "media") {
      setLoadingFiles(true);
      getAllFiles()
        .then((files) => setAvailableFiles(files))
        .finally(() => setLoadingFiles(false));
    }
  }, [waMessageType]);

  const resetForm = () => {
    setName("");
    setTriggerType("SLA_BREACH");
    setFromStatus("any");
    setToStatus("any");
    setSlaPriority("any");
    setSlaBreachType("any");
    setActions([]);
    setIsAddingAction(true);
    setCurrentActionType("");
    resetActionFields();
  };

  const resetActionFields = () => {
    setRecipientId("");
    setMessageTemplate(
      "הקריאה {ticketTitle} חרגה מ{breachType}! עדיפות: {priority}",
    );
    setWaPhoneColumnId("");
    setWaContent("");
    setWaMediaFileId("");
    setWaDelay(0);
    setWebhookUrl("");
    setTaskTitle("");
    setTaskDescription("");
    setTaskStatus("todo");
    setTaskPriority("high");
    setTaskAssigneeId("");
    setTaskDueDays(0);
    setTaskTags([]);
    setTaskTagInput("");
  };

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

  const validateCurrentAction = () => {
    if (!currentActionType) return false;
    if (currentActionType === "SEND_NOTIFICATION")
      return !!recipientId && !!messageTemplate;
    if (currentActionType === "SEND_WHATSAPP") {
      if (!waPhoneColumnId || !waContent) return false;
      if (waMessageType === "media" && !waMediaFileId) return false;
      const waBeforeCount =
        editingActionIndex !== null
          ? actions.filter(
              (a, i) => a.type === "SEND_WHATSAPP" && i < editingActionIndex,
            ).length
          : actions.filter((a) => a.type === "SEND_WHATSAPP").length;
      if (waBeforeCount > 0) {
        const minDelay = waBeforeCount >= 2 ? 20 : 10;
        if (!waDelay || waDelay < minDelay) return false;
      }
      return true;
    }
    if (currentActionType === "WEBHOOK")
      return !!webhookUrl && webhookUrl.startsWith("http");
    if (currentActionType === "CREATE_TASK") return !!taskTitle;
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
              titleTemplate:
                triggerType === "SLA_BREACH" ? "חריגת SLA" : "עדכון קריאה",
            }
          : currentActionType === "SEND_WHATSAPP"
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
    setCurrentActionType("");
    resetActionFields();
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
    setCurrentActionType(action.type as ActionType);

    if (action.type === "SEND_NOTIFICATION") {
      setRecipientId(action.config.recipientId?.toString() || "");
      setMessageTemplate(action.config.messageTemplate || "");
    } else if (action.type === "SEND_WHATSAPP") {
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
      setTaskPriority(action.config.priority || "high");
      setTaskAssigneeId(action.config.assigneeId?.toString() || "");
      setTaskDueDays(action.config.dueDays || 0);
      setTaskTags(action.config.tags || []);
    }

    setEditingActionIndex(index);
    setIsAddingAction(true);
  };

  const handleSubmit = async () => {
    if (actions.length === 0 && isAddingAction && validateCurrentAction()) {
      handleConfirmAction();
    }

    if (actions.length === 0) {
      alert("נא להוסיף לפחות פעולה אחת");
      return;
    }

    setLoading(true);
    try {
      let triggerConfig: any = {};
      if (triggerType === "TICKET_STATUS_CHANGE") {
        triggerConfig = {
          fromStatus: fromStatus === "any" ? undefined : fromStatus,
          toStatus: toStatus === "any" ? undefined : toStatus,
        };
      } else if (triggerType === "SLA_BREACH") {
        triggerConfig = {
          priority: slaPriority === "any" ? undefined : slaPriority,
          breachType: slaBreachType === "any" ? undefined : slaBreachType,
        };
      }

      let finalActionType = "";
      let finalActionConfig = {};

      if (actions.length > 1) {
        finalActionType = "MULTI_ACTION";
        finalActionConfig = { actions };
      } else if (actions.length === 1) {
        finalActionType = actions[0].type;
        finalActionConfig = actions[0].config;
      }

      const data = {
        name:
          name ||
          (triggerType === "TICKET_STATUS_CHANGE"
            ? "אוטומציית סטטוס"
            : "אוטומציית SLA"),
        triggerType,
        triggerConfig,
        actionType: finalActionType,
        actionConfig: finalActionConfig,
      };

      if (initialData?.id) {
        await updateAutomationRule(initialData.id, data);
      } else {
        await createAutomationRule(data);
      }

      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error(error);
      alert("שגיאה בשמירת האוטומציה");
    } finally {
      setLoading(false);
    }
  };

  const canProceedStep1 = name.length > 2;
  const canProceedStep2 = true;
  const canSubmit =
    actions.length > 0 || (isAddingAction && validateCurrentAction());

  if (!open) return null;

  // Step 1: Name & Trigger Type
  const renderStep1 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          איך נקרא לאוטומציה הזו?
        </label>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#4f95ff] transition-colors"
          placeholder="לדוגמה: התראה על חריגת SLA קריטית"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          מה יפעיל את האוטומציה?
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TriggerCard
            title="חריגת SLA"
            description="כאשר קריאה חורגת מזמני היעד"
            icon={<AlertTriangle className="text-red-500" size={24} />}
            selected={triggerType === "SLA_BREACH"}
            onClick={() => {
              setTriggerType("SLA_BREACH");
              setMessageTemplate(
                "הקריאה {ticketTitle} חרגה מ{breachType}! עדיפות: {priority}",
              );
            }}
          />
          <TriggerCard
            title="שינוי סטטוס קריאה"
            description="כאשר קריאה עוברת לסטטוס מסוים"
            icon={<Zap className="text-[#4f95ff]" size={24} />}
            selected={triggerType === "TICKET_STATUS_CHANGE"}
            onClick={() => {
              setTriggerType("TICKET_STATUS_CHANGE");
              setMessageTemplate("הקריאה {ticketTitle} עברה לסטטוס {toStatus}");
            }}
          />
        </div>
      </div>
    </div>
  );

  // Step 2: Trigger Conditions
  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-gray-50 p-4 rounded-lg mb-4 text-sm text-gray-600 flex items-center gap-2">
        {triggerType === "SLA_BREACH" ? (
          <AlertTriangle size={16} className="text-red-500" />
        ) : (
          <Zap size={16} className="text-[#4f95ff]" />
        )}
        <span>
          הגדרת תנאים עבור:{" "}
          <span className="font-semibold">
            {triggerType === "SLA_BREACH" ? "חריגת SLA" : "שינוי סטטוס קריאה"}
          </span>
        </span>
      </div>

      {triggerType === "SLA_BREACH" && (
        <div className="space-y-5 p-5 border rounded-xl bg-red-50 border-red-100">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              סוג חריגת SLA
            </label>
            <select
              value={slaBreachType}
              onChange={(e) => setSlaBreachType(e.target.value as any)}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
            >
              <option value="any">כל סוג חריגה</option>
              <option value="RESPONSE">חריגת זמן תגובה</option>
              <option value="RESOLVE">חריגת זמן פתרון</option>
            </select>
            <div className="text-xs text-gray-500 bg-white p-2 rounded mt-1">
              {slaBreachType === "RESPONSE" && (
                <span>
                  ⏱️ <strong>זמן תגובה:</strong> כשהקריאה נשארת בסטטוס "פתוח"
                  מעבר לזמן התגובה שהוגדר
                </span>
              )}
              {slaBreachType === "RESOLVE" && (
                <span>
                  ⏱️ <strong>זמן פתרון:</strong> כשהקריאה לא טופלה מעבר לזמן
                  הפתרון שהוגדר
                </span>
              )}
              {slaBreachType === "any" && (
                <span>יופעל על כל סוג חריגה (תגובה או פתרון)</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              עבור איזה עדיפות?
            </label>
            <select
              value={slaPriority}
              onChange={(e) => setSlaPriority(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
            >
              <option value="any">כל עדיפות</option>
              <option value="CRITICAL">קריטי</option>
              <option value="HIGH">גבוה</option>
              <option value="MEDIUM">בינוני</option>
              <option value="LOW">נמוך</option>
            </select>
          </div>
        </div>
      )}

      {triggerType === "TICKET_STATUS_CHANGE" && (
        <div className="grid grid-cols-2 gap-4 p-5 border rounded-xl bg-blue-50 border-blue-100">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              מסטטוס
            </label>
            <select
              value={fromStatus}
              onChange={(e) => setFromStatus(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="any">כל סטטוס</option>
              <option value="OPEN">פתוח</option>
              <option value="IN_PROGRESS">בטיפול</option>
              <option value="WAITING">ממתין</option>
              <option value="RESOLVED">טופל</option>
              <option value="CLOSED">סגור</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              לסטטוס
            </label>
            <select
              value={toStatus}
              onChange={(e) => setToStatus(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="any">כל סטטוס</option>
              <option value="OPEN">פתוח</option>
              <option value="IN_PROGRESS">בטיפול</option>
              <option value="WAITING">ממתין</option>
              <option value="RESOLVED">טופל</option>
              <option value="CLOSED">סגור</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );

  // Step 3: Actions
  const renderStep3 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          פעולות לביצוע
        </label>
        <div className="bg-[#4f95ff]/10 border border-[#4f95ff]/20 rounded-lg p-3 flex items-start gap-2 mb-2">
          <Shield size={16} className="text-[#4f95ff] mt-0.5 shrink-0" />
          <div className="text-xs text-[#4f95ff] leading-relaxed">
            {maxActions === 2 ? (
              <>
                ניתן להגדיר עד 2 פעולות באוטומציה זו.
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
                <div className="p-2 bg-[#4f95ff]/20 text-[#4f95ff] rounded-lg">
                  {act.type === "SEND_NOTIFICATION" && <Bell size={20} />}
                  {act.type === "SEND_WHATSAPP" && <MessageSquare size={20} />}
                  {act.type === "WEBHOOK" && (
                    <div className="font-bold text-xs">API</div>
                  )}
                  {act.type === "CREATE_TASK" && <CheckSquare size={20} />}
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {act.type === "SEND_NOTIFICATION" && "שליחת התראה"}
                    {act.type === "SEND_WHATSAPP" && "שליחת WhatsApp"}
                    {act.type === "WEBHOOK" && "Webhook"}
                    {act.type === "CREATE_TASK" && "יצירת משימה"}
                  </div>
                  <div className="text-xs text-gray-500">פעולה #{idx + 1}</div>
                </div>
              </div>
              {!isAddingAction && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => editAction(idx)}
                    className="text-[#4f95ff] hover:text-blue-700 p-2 hover:bg-blue-50 rounded-full transition-colors"
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
                : `הוספת פעולה חדשה (${actions.length + 1}/${maxActions})`}
            </h4>
            {actions.length > 0 && (
              <button
                onClick={() => {
                  setIsAddingAction(false);
                  setEditingActionIndex(null);
                  setCurrentActionType("");
                  resetActionFields();
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ביטול
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <ActionCard
              title="שליחת התראה"
              description="שלח הודעה למערכת"
              icon={<Bell className="text-yellow-500" size={24} />}
              selected={currentActionType === "SEND_NOTIFICATION"}
              onClick={() => setCurrentActionType("SEND_NOTIFICATION")}
            />
            <ActionCard
              title="שליחת WhatsApp"
              description="שלח הודעה דרך Green API"
              icon={<MessageSquare className="text-green-600" size={24} />}
              selected={currentActionType === "SEND_WHATSAPP"}
              onClick={() => setCurrentActionType("SEND_WHATSAPP")}
            />
            <ActionCard
              title="יצירת משימה"
              description="צור משימה חדשה אוטומטית"
              icon={<CheckSquare className="text-[#4f95ff]" size={24} />}
              selected={currentActionType === "CREATE_TASK"}
              onClick={() => setCurrentActionType("CREATE_TASK")}
            />
            <ActionCard
              title="Webhook"
              description="שלח נתונים למערכת חיצונית"
              icon={<div className="font-bold text-gray-600 text-lg">API</div>}
              selected={currentActionType === "WEBHOOK"}
              onClick={() => setCurrentActionType("WEBHOOK")}
            />
          </div>

          {/* Action Configuration Forms */}
          {currentActionType === "SEND_NOTIFICATION" && (
            <div className="bg-yellow-50 p-5 rounded-xl border border-yellow-100 space-y-4 animate-in fade-in slide-in-from-top-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  למי לשלוח?
                </label>
                <select
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
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
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-2">
                  משתנים זמינים: {"{ticketTitle}"}, {"{ticketId}"},{" "}
                  {"{priority}"}, {"{breachType}"}, {"{fromStatus}"},{" "}
                  {"{toStatus}"}
                </p>
              </div>
            </div>
          )}

          {currentActionType === "SEND_WHATSAPP" && (
            <div className="bg-green-50 p-5 rounded-xl border border-green-100 space-y-5 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2 text-green-800 font-medium pb-2 border-b border-green-200">
                <MessageSquare size={18} />
                הגדרות הודעת WhatsApp
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  למי לשלוח?
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 p-3 bg-white rounded-lg border cursor-pointer hover:border-green-300 flex-1">
                    <input
                      type="radio"
                      checked={waTargetType === "private"}
                      onChange={() => {
                        setWaTargetType("private");
                        setWaPhoneColumnId("");
                      }}
                      className="text-green-600"
                    />
                    <span className="font-medium text-gray-700">אדם פרטי</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 bg-white rounded-lg border cursor-pointer hover:border-green-300 flex-1">
                    <input
                      type="radio"
                      checked={waTargetType === "group"}
                      onChange={() => {
                        setWaTargetType("group");
                        setWaPhoneColumnId("manual:");
                      }}
                      className="text-green-600"
                    />
                    <span className="font-medium text-gray-700">קבוצה</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {waTargetType === "group" ? "מזהה קבוצה" : "מספר טלפון"}
                </label>
                <input
                  type="text"
                  value={waPhoneColumnId.replace("manual:", "")}
                  onChange={(e) =>
                    setWaPhoneColumnId(`manual:${e.target.value}`)
                  }
                  placeholder={
                    waTargetType === "group"
                      ? "לדוגמה: 123456789-1612345678@g.us"
                      : "לדוגמה: 0501234567"
                  }
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
                  dir="ltr"
                />
              </div>

              {(() => {
                const waBeforeCount =
                  editingActionIndex !== null
                    ? actions.filter(
                        (a, i) =>
                          a.type === "SEND_WHATSAPP" && i < editingActionIndex,
                      ).length
                    : actions.filter((a) => a.type === "SEND_WHATSAPP").length;

                if (waBeforeCount > 0) {
                  const minDelay = waBeforeCount >= 2 ? 20 : 10;
                  return (
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                      <div className="flex items-center gap-2 text-orange-800 font-medium mb-2">
                        <Clock size={16} />
                        השהייה לפני שליחה (בשניות)
                      </div>
                      <p className="text-xs text-orange-600 mb-3">
                        נא להגדיר השהייה של לפחות {minDelay} שניות
                      </p>
                      <input
                        type="number"
                        min={minDelay}
                        value={waDelay}
                        onChange={(e) =>
                          setWaDelay(parseInt(e.target.value) || 0)
                        }
                        className={`w-full px-4 py-2 bg-white border rounded-lg ${
                          waDelay < minDelay
                            ? "border-red-500 ring-1 ring-red-500"
                            : "border-orange-200"
                        }`}
                      />
                    </div>
                  );
                }
                return null;
              })()}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  סוג הודעה
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 p-3 bg-white rounded-lg border cursor-pointer hover:border-green-300 flex-1">
                    <input
                      type="radio"
                      checked={waMessageType === "private"}
                      onChange={() => setWaMessageType("private")}
                      className="text-green-600"
                    />
                    <span className="font-medium text-gray-700">
                      הודעה רגילה
                    </span>
                  </label>
                  <label className="flex items-center gap-2 p-3 bg-white rounded-lg border cursor-pointer hover:border-green-300 flex-1">
                    <input
                      type="radio"
                      checked={waMessageType === "media"}
                      onChange={() => setWaMessageType("media")}
                      className="text-green-600"
                    />
                    <span className="font-medium text-gray-700">
                      הודעה עם מדיה
                    </span>
                  </label>
                </div>
              </div>

              {waMessageType === "media" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    בחר קובץ לשליחה
                  </label>
                  {loadingFiles ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                      <Loader2 className="animate-spin" size={16} />
                      טוען קבצים...
                    </div>
                  ) : (
                    <select
                      value={waMediaFileId}
                      onChange={(e) => setWaMediaFileId(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
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
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
                  placeholder="הקלד את ההודעה כאן..."
                />
                <p className="text-xs text-gray-500 mt-2">
                  משתנים זמינים: {"{ticketTitle}"}, {"{ticketId}"},{" "}
                  {"{priority}"}, {"{breachType}"}
                </p>
              </div>
            </div>
          )}

          {currentActionType === "WEBHOOK" && (
            <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="text-gray-800 font-medium pb-2 border-b border-gray-200">
                Webhook Configuration
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  כתובת ה-URL לשליחה (POST)
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://api.example.com/webhook"
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg font-mono text-sm"
                  dir="ltr"
                />
                <p className="text-xs text-gray-500 mt-2">
                  המערכת תשלח בקשת POST לכתובת זו עם כל הנתונים הרלוונטיים
                  (JSON).
                </p>
              </div>
            </div>
          )}

          {currentActionType === "CREATE_TASK" && (
            <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 space-y-5 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2 text-blue-800 font-medium pb-2 border-b border-blue-200">
                <CheckSquare size={18} />
                הגדרות משימה חדשה
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  כותרת המשימה
                </label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
                  placeholder="לדוגמה: טיפול בחריגת SLA - {ticketTitle}"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  תיאור
                </label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
                  rows={3}
                  placeholder="תיאור המשימה..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    סטטוס
                  </label>
                  <select
                    value={taskStatus}
                    onChange={(e) => setTaskStatus(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
                  >
                    <option value="todo">משימות</option>
                    <option value="in_progress">משימות בטיפול</option>
                    <option value="waiting_client">ממתינים לאישור לקוח</option>
                    <option value="on_hold">משימות בהשהייה</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    עדיפות
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
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
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
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
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg"
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
                    className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddTaskTag}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm border"
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
                        onClick={() =>
                          setTaskTags(taskTags.filter((t) => t !== tag))
                        }
                        className="hover:text-blue-900 font-bold px-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentActionType && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleConfirmAction}
                disabled={!validateCurrentAction()}
                className="px-6 py-2 bg-[#4f95ff] text-white font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {editingActionIndex !== null ? "שמור שינוי" : "אשר פעולה"}
              </button>
            </div>
          )}
        </div>
      ) : actions.length < maxActions ? (
        <div className="bg-gray-50 p-8 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center text-center">
          <p className="text-gray-600 mb-4 font-medium">
            האם תרצה לבצע פעולה נוספת?
          </p>
          <button
            onClick={() => setIsAddingAction(true)}
            className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center gap-2"
          >
            <Zap size={18} />
            הוסף פעולה נוספת ({actions.length}/{maxActions})
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

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4"
      dir="rtl"
      onClick={() => onOpenChange(false)}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#f4f8f8] px-8 py-5 border-b border-gray-100 flex justify-between items-center">
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-[#000000]">
              {initialData ? "עריכת אוטומציית שירות" : "אשף אוטומציות השירות"}
            </h3>
            <div className="flex gap-2 mt-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i <= step ? "w-8 bg-[#4f95ff]" : "w-2 bg-gray-200"
                  }`}
                />
              ))}
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 relative min-h-[400px]">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
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
            <div />
          )}

          {step < totalSteps ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !canProceedStep1}
              className="px-8 py-2.5 bg-[#4f95ff] text-white font-medium rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
            >
              המשך לשלב הבא
              <ArrowLeft size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || !canSubmit}
              className="px-8 py-2.5 bg-[#a24ec1] text-white font-medium rounded-xl hover:bg-purple-600 disabled:opacity-50 transition-all shadow-lg shadow-purple-200 flex items-center gap-2"
            >
              {loading && <Loader2 className="animate-spin" size={18} />}
              {initialData ? "שמור שינויים" : "צור אוטומציה"}
              <CheckCircle2 size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Trigger Card Component
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
          ? "border-[#4f95ff] bg-blue-50 shadow-md ring-2 ring-blue-200 ring-offset-2"
          : "border-gray-100 bg-white hover:border-blue-200 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`p-3 rounded-lg ${
            selected ? "bg-white" : "bg-gray-100 group-hover:bg-white"
          } transition-colors`}
        >
          {icon}
        </div>
        <div>
          <h4
            className={`font-bold text-lg mb-1 ${
              selected ? "text-blue-900" : "text-gray-800"
            }`}
          >
            {title}
          </h4>
          <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        </div>
      </div>
      {selected && (
        <div className="absolute top-4 left-4 text-[#4f95ff]">
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

// Action Card Component
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
    <div
      onClick={onClick}
      className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 group ${
        selected
          ? "border-[#4f95ff] bg-blue-50 shadow-md ring-2 ring-blue-200 ring-offset-1"
          : "border-gray-100 bg-white hover:border-blue-200 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-lg ${
            selected ? "bg-white" : "bg-gray-100 group-hover:bg-white"
          } transition-colors`}
        >
          {icon}
        </div>
        <div>
          <h4
            className={`font-medium text-sm ${
              selected ? "text-blue-900" : "text-gray-800"
            }`}
          >
            {title}
          </h4>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      {selected && (
        <div className="absolute top-2 left-2 text-[#4f95ff]">
          <CheckCircle2
            size={16}
            fill="currentColor"
            className="text-blue-100"
          />
        </div>
      )}
    </div>
  );
}
