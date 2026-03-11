"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AutomationModal from "@/components/AutomationModal";
import MultiEventAutomationModal from "@/components/MultiEventAutomationModal";
import AIAutomationCreator from "@/components/AIAutomationCreator";
import {
  deleteAutomationRule,
  toggleAutomationRule,
  getAutomationCategoryUsage,
} from "@/app/actions/automations";
import { Plus, Trash2, Power, Edit, Zap, Sparkles, AlertTriangle } from "lucide-react";
import { showConfirm } from "@/hooks/use-modal";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface AutomationRule {
  id: number;
  name: string;
  triggerType: string;
  triggerConfig: any;
  actionType: string;
  actionConfig: any;
  isActive: boolean;
  creator: {
    name: string;
  };
  calendarEvent?: {
    title: string;
  };
  calendarEventId?: string | null;
}

interface AutomationsListProps {
  initialRules: AutomationRule[];
  users: any[];
  tables: { id: number; name: string; schemaJson: any }[];
  currentUserId: number;
  folders?: { id: number; name: string; _count?: any }[];
  userPlan?: string;
}

export default function AutomationsList({
  initialRules,
  users,
  tables,
  currentUserId,
  folders: propsFolders = [],
  userPlan = "basic",
}: AutomationsListProps) {
  const [rules, setRules] = useState<AutomationRule[]>(initialRules);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMultiEventModalOpen, setIsMultiEventModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Use folders from props
  const [localFolders, setLocalFolders] = useState(propsFolders || []);

  // Sync local state when props change (e.g. after router.refresh())
  useEffect(() => {
    setRules(initialRules);
  }, [initialRules]);

  useEffect(() => {
    setLocalFolders(propsFolders || []);
  }, [propsFolders]);

  // Usage tracking
  const [usage, setUsage] = useState<{
    general: { count: number; limit: number };
  } | null>(null);

  useEffect(() => {
    getAutomationCategoryUsage().then((res) => {
      if (res.success && res.data) setUsage({ general: res.data.general });
    });
  }, [rules.length]);

  const isAtLimit = usage ? usage.general.count >= usage.general.limit : false;

  // State for interactions
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);
  const [movingRuleId, setMovingRuleId] = useState<number | null>(null);
  const [successRuleId, setSuccessRuleId] = useState<number | null>(null);

  const router = useRouter();

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const { createFolder } = await import("@/app/actions/folders");
    const res = await createFolder(newFolderName, "AUTOMATION");
    if (res.success && res.data) {
      setLocalFolders([...localFolders, res.data]);
      setNewFolderName("");
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: number) => {
    if (!(await showConfirm({ message: "האם אתה בטוח? אוטומציות בתיקייה יוסרו מהתיקייה.", variant: "destructive" })))
      return;
    const { deleteFolder } = await import("@/app/actions/folders");
    await deleteFolder(folderId);
    setLocalFolders(localFolders.filter((f) => f.id !== folderId));
    if (selectedFolderId === folderId) setSelectedFolderId(null);
  };

  const handleMoveToFolder = async (
    ruleId: number,
    folderId: number | null,
  ) => {
    setMovingRuleId(ruleId);
    setActiveDropdownId(null); // Close immediately or keep open? Better close.

    try {
      const { moveItemToFolder } = await import("@/app/actions/folders");
      await moveItemToFolder(ruleId, folderId, "AUTOMATION");

      const updatedRules = rules.map((r) =>
        r.id === ruleId ? { ...r, folderId } : r,
      );
      setRules(updatedRules);

      // Show success
      setMovingRuleId(null);
      setSuccessRuleId(ruleId);
      setTimeout(() => setSuccessRuleId(null), 2000);
    } catch (error) {
      console.error("Failed to move folder", error);
      toast.error(getUserFriendlyError(error));
      setMovingRuleId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (await showConfirm({ message: "האם אתה בטוח שברצונך למחוק אוטומציה זו?", variant: "destructive" })) {
      try {
        await deleteAutomationRule(id);
        setRules(rules.filter((r) => r.id !== id));
        toast.success("האוטומציה נמחקה בהצלחה");
      } catch (error) {
        toast.error(getUserFriendlyError(error));
      }
    }
  };

  const handleToggle = async (id: number, currentStatus: boolean) => {
    try {
      await toggleAutomationRule(id, !currentStatus);
      setRules(
        rules.map((r) => (r.id === id ? { ...r, isActive: !currentStatus } : r)),
      );
      toast.success(!currentStatus ? "האוטומציה הופעלה" : "האוטומציה הושבתה");
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    }
  };

  const handleEdit = (rule: AutomationRule) => {
    // Calendar Automations Redirection check
    if (rule.triggerType === "EVENT_TIME") {
      // Global (no specific event ID)
      if (!rule.calendarEventId) {
        router.push("/calendar?openGlobalAutomations=true");
        return;
      }
      // Single Event
      if (rule.calendarEventId) {
        router.push(
          `/calendar?eventId=${rule.calendarEventId}&openEdit=true&tab=automations`,
        );
        return;
      }
    }

    // Legacy string check fallback (just in case)
    if (
      rule.name === "Global Event Automation" ||
      (typeof rule.name === "string" &&
        rule.name.includes("Global Event Automation"))
    ) {
      router.push("/calendar?openGlobalAutomations=true");
      return;
    }

    if (
      rule.actionType === "ADD_TO_NURTURE_LIST" &&
      rule.actionConfig?.listId
    ) {
      router.push(
        `/nurture-hub/${rule.actionConfig.listId}?openAutomation=true`,
      );
      return;
    }

    if (
      rule.triggerType === "SLA_BREACH" ||
      rule.triggerType === "TICKET_STATUS_CHANGE"
    ) {
      router.push(`/service/automations?editId=${rule.id}`);
      return;
    }

    if (rule.triggerType === "MULTI_EVENT_DURATION") {
      setEditingRule(rule);
      setIsMultiEventModalOpen(true);
    } else {
      setEditingRule(rule);
      setIsModalOpen(true);
    }
  };

  const getTriggerDescription = (rule: AutomationRule) => {
    const config = rule.triggerConfig || {};

    switch (rule.triggerType) {
      case "TICKET_STATUS_CHANGE": {
        const statusMap: Record<string, string> = {
          OPEN: "פתוח",
          IN_PROGRESS: "בטיפול",
          WAITING: "ממתין",
          RESOLVED: "טופל",
          CLOSED: "סגור",
          any: "כל סטטוס",
        };
        const from = config.fromStatus
          ? statusMap[config.fromStatus] || config.fromStatus
          : "כל סטטוס";
        const to = config.toStatus
          ? statusMap[config.toStatus] || config.toStatus
          : "כל סטטוס";
        return `שינוי סטטוס מ-${from} ל-${to}`;
      }

      case "SLA_BREACH": {
        const breachTypeMap: Record<string, string> = {
          RESPONSE: "זמן תגובה",
          RESOLVE: "זמן פתרון",
          any: "כל חריגה",
        };
        const priorityMap: Record<string, string> = {
          CRITICAL: "קריטי",
          HIGH: "גבוה",
          MEDIUM: "בינוני",
          LOW: "נמוך",
          any: "כל עדיפות",
        };
        const bType = config.breachType
          ? breachTypeMap[config.breachType] || config.breachType
          : "כל חריגה";
        const prior = config.priority
          ? priorityMap[config.priority] || config.priority
          : "כל עדיפות";
        return `חריגת SLA (${bType}) בעדיפות ${prior}`;
      }

      case "TASK_STATUS_CHANGE": {
        const taskStatusMap: Record<string, string> = {
          todo: "משימות",
          in_progress: "משימות בטיפול",
          waiting_client: "ממתינים לאישור לקוח",
          on_hold: "משימות בהשהייה",
          completed_month: "בוצעו החודש",
          done: "משימות שבוצעו",
          any: "כל סטטוס",
        };
        const from = config.fromStatus
          ? taskStatusMap[config.fromStatus] || config.fromStatus
          : "כל סטטוס";
        const to = config.toStatus
          ? taskStatusMap[config.toStatus] || config.toStatus
          : "כל סטטוס";
        return `שינוי סטטוס מ-${from} ל-${to}`;
      }

      case "NEW_RECORD":
        const tableName =
          tables.find((t) => t.id === Number(config.tableId))?.name ||
          "טבלה לא ידועה";
        return `רשומה חדשה ב${tableName}`;

      case "MULTI_EVENT_DURATION":
        return "🔥 חישוב אירועים מרובים";

      case "VIEW_METRIC_THRESHOLD":
        return "שינוי מדדי תצוגה";

      case "RECORD_FIELD_CHANGE":
        return "שינוי ערך בשדה";

      case "TIME_SINCE_CREATION":
        return "זמן מאז יצירה";

      case "DIRECT_DIAL": {
        const dialTableName =
          tables.find((t) => t.id === Number(config.tableId))?.name ||
          "טבלה לא ידועה";
        return `חיוג ישיר ב${dialTableName}`;
      }

      case "EVENT_TIME":
        return "תזמון אירוע (לפי שעה)";

      default:
        return rule.triggerType;
    }
  };

  const getActionDescription = (rule: AutomationRule) => {
    const config = rule.actionConfig || {};
    switch (rule.actionType) {
      case "SEND_NOTIFICATION":
        const user = users.find((u) => u.id === config.recipientId);
        return `שליחת התראה ל-${user ? user.name : "משתמש לא ידוע"}`;
      case "SEND_WHATSAPP":
        return `שליחת וואטסאפ (${
          config.messageType === "media" ? "מדיה" : "הודעה"
        })`;
      case "SEND_SMS":
        return `שליחת SMS (${
          config.messageType === "media" ? "מדיה" : "הודעה"
        })`;
      case "CREATE_TASK":
        return "יצירת משימה";
      case "CALCULATE_DURATION":
        return "מדידת משך זמן בסטטוס";
      case "ADD_TO_NURTURE_LIST":
        return `הוספה לרשימת תפוצה: ${config.listId}`;
      case "CALCULATE_MULTI_EVENT_DURATION":
        return "מדידת זמנים בין אירועים";
      case "UPDATE_RECORD_FIELD": {
        const tableId = rule.triggerConfig?.tableId;
        const columnId = config.columnId;
        let columnLabel = columnId;

        if (tableId && columnId) {
          const table = tables.find((t) => t.id === Number(tableId));
          if (table?.schemaJson) {
            const schema =
              typeof table.schemaJson === "string"
                ? JSON.parse(table.schemaJson)
                : table.schemaJson;

            const columns = Array.isArray(schema) ? schema : schema?.columns;

            const col = columns?.find(
              (c: any) => c.name === columnId || c.id === columnId,
            );
            if (col?.label) {
              columnLabel = col.label;
            }
          }
        }
        return `עדכון שדה: ${columnLabel || "לא הוגדר"}`;
      }
      case "WEBHOOK":
        return "שליחת Webhook";
      default:
        return rule.actionType;
    }
  };

  const filteredRules = selectedFolderId
    ? rules.filter((r) => (r as any).folderId === selectedFolderId)
    : rules;

  return (
    <div className="flex gap-6">
      {/* Sidebar Folders */}
      <div className="w-1/4 min-w-[250px] space-y-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-700">תיקיות</h3>
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="text-blue-600 hover:text-blue-800"
            >
              <Plus size={18} />
            </button>
          </div>

          {isCreatingFolder && (
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="border rounded px-2 py-1 w-full text-sm"
                placeholder="שם תיקיה..."
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                className="text-green-600 text-sm"
              >
                שמור
              </button>
              <button
                onClick={() => setIsCreatingFolder(false)}
                className="text-gray-500 text-sm"
              >
                בטל
              </button>
            </div>
          )}

          <ul className="space-y-1">
            <li>
              <button
                onClick={() => setSelectedFolderId(null)}
                className={`w-full text-right px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedFolderId === null
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                כל האוטומציות
              </button>
            </li>
            {localFolders.map((folder) => (
              <li
                key={folder.id}
                className="group flex items-center justify-between hover:bg-gray-50 rounded-md pr-0"
              >
                <button
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`flex-1 text-right px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedFolderId === folder.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600"
                  }`}
                >
                  {folder.name}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(folder.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex-1 space-y-6">
        {isAtLimit && usage && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>
              הגעת למגבלת האוטומציות ({usage.general.count}/{usage.general.limit}).
              מחק אוטומציות קיימות או שדרג את התוכנית כדי ליצור חדשות.
            </span>
          </div>
        )}

        <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium text-gray-900">
              {selectedFolderId
                ? localFolders.find((f) => f.id === selectedFolderId)?.name
                : "כל האוטומציות"}
            </h2>
            {usage && usage.general.limit !== Infinity && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {usage.general.count}/{usage.general.limit}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsAIModalOpen(true)}
              disabled={isAtLimit}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="ml-2 -mr-1 h-5 w-5" />
              צור אוטומציה עם AI
            </button>
            <button
              onClick={() => {
                setEditingRule(null);
                setIsModalOpen(true);
              }}
              disabled={isAtLimit}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="ml-2 -mr-1 h-5 w-5" />
              אוטומציה חדשה
            </button>
            <button
              onClick={() => {
                setEditingRule(null);
                setIsMultiEventModalOpen(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-orange-600 text-sm font-medium rounded-md shadow-sm text-orange-600 bg-white hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              <Zap className="ml-2 -mr-1 h-5 w-5" />
              🔥 אירועים מרובים
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRules.map((rule) => {
            let displayName = rule.name;

            // Handle Nurture Auto-Add legacy names
            if (
              typeof displayName === "string" &&
              (displayName.startsWith("Nurture Auto-Add:") ||
                displayName.startsWith("הוספה אוטומטית:"))
            ) {
              // Try to enhance with list name if available
              if (
                rule.actionType === "ADD_TO_NURTURE_LIST" &&
                rule.actionConfig?.listId
              ) {
                const listNameMap: Record<string, string> = {
                  birthday: "יום הולדת",
                  referral: "חבר מביא חבר",
                  upsell: "מכירות חוזרות",
                  winback: "שימור לקוחות",
                  review: "ביקורות",
                  renewal: "חידושים",
                };
                const listName =
                  listNameMap[rule.actionConfig.listId] ||
                  rule.actionConfig.listId;

                // Extract the trigger part
                let parts = displayName.includes(":")
                  ? displayName.split(":")[1].trim()
                  : displayName;

                // Clean up English technical terms
                if (
                  parts === "record_created" ||
                  parts.includes("record_created")
                ) {
                  parts = parts.replace("record_created", "רשומה חדשה");
                } else if (
                  parts === "status_changed" ||
                  parts.includes("status_changed")
                ) {
                  parts = parts.replace("status_changed", "שינוי סטטוס");
                }

                // Ensure table name is included
                const tableId = rule.triggerConfig?.tableId;
                if (tableId) {
                  const tableName = tables.find(
                    (t) => t.id === Number(tableId),
                  )?.name;
                  if (tableName && !parts.includes(tableName)) {
                    // If clean parts don't include table name, append it
                    // Attempt to clean separator if exists
                    parts = parts.replace(/[-–—]*$/, "").trim();
                    parts = `${parts} ב-${tableName}`;
                  }
                }

                // Construct new Hebrew name
                displayName = `הוספה לרשימת ${listName}: ${parts.trim()}`;
                displayName = displayName.replace(
                  "Nurture Auto-Add:",
                  "הוספה אוטומטית:",
                );
              }

              // Handle Legacy Event Automation Names
              if (typeof displayName === "string") {
                // translate Global Event Automation
                if (displayName.includes("Global Event Automation")) {
                  displayName = displayName.replace(
                    "Global Event Automation",
                    "אוטומציה גלובלית של אירועי יומן",
                  );
                }

                // translate Event Automation (if distinct or part of valid remaining text)
                if (displayName.includes("Event Automation")) {
                  displayName = displayName.replace(
                    "Event Automation",
                    "אוטומציה לאירוע",
                  );
                }

                // translate "m before" to " דקות לפני" using regex for robustness
                displayName = displayName.replace(
                  /(\d+)m before/gi,
                  "$1 דקות לפני",
                );
              }
            }

            const isLongName = displayName.length > 30;

            return (
              <div
                key={rule.id}
                className={`relative bg-white pt-5 px-4 pb-12 sm:pt-6 sm:px-6 shadow rounded-lg overflow-hidden border-2 transition-colors ${
                  rule.isActive
                    ? "border-transparent"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                <dt>
                  <div className="absolute top-4 left-4 flex gap-2">
                    {/* Move Folder Dropdown */}
                    <div className="relative">
                      {movingRuleId === rule.id ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                      ) : successRuleId === rule.id ? (
                        <div className="text-green-500">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-check"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            setActiveDropdownId(
                              activeDropdownId === rule.id ? null : rule.id,
                            )
                          }
                          className={`hover:text-blue-500 transition-colors ${activeDropdownId === rule.id ? "text-blue-600" : "text-gray-400"}`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-folder-input"
                          >
                            <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2" />
                            <path d="M2 13h10" />
                            <path d="m9 10 3 3-3 3" />
                          </svg>
                        </button>
                      )}

                      {activeDropdownId === rule.id && (
                        <div className="absolute left-0 mt-1 w-40 bg-white border border-gray-200 shadow-lg rounded-md z-20 animate-in fade-in zoom-in-95 duration-100">
                          <button
                            onClick={() => handleMoveToFolder(rule.id, null)}
                            className="block w-full text-right px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            ללא תיקייה
                          </button>
                          {localFolders.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => handleMoveToFolder(rule.id, f.id)}
                              className="block w-full text-right px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              {f.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {rule.triggerType !== "VIEW_METRIC_THRESHOLD" && (
                      <button
                        onClick={() => handleEdit(rule)}
                        className="text-gray-400 hover:text-blue-500 transition-colors"
                      >
                        <Edit size={20} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                  <div
                    className={`p-3 rounded-md inline-flex items-center justify-center ${
                      rule.isActive ? "bg-blue-500" : "bg-gray-400"
                    } text-white`}
                  >
                    <Power size={24} />
                  </div>
                  <div className="ml-16 flex items-start gap-2 min-h-14">
                    <p
                      className={`font-semibold text-gray-900 wrap-break-word leading-tight ${
                        isLongName ? "text-lg" : "text-xl"
                      }`}
                    >
                      {displayName}
                    </p>
                    {rule.triggerType === "VIEW_METRIC_THRESHOLD" && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
                        תצוגה
                      </span>
                    )}
                  </div>
                </dt>
                <dd className="ml-16 pb-6 flex items-baseline sm:pb-7">
                  <div className="text-sm text-gray-500">
                    <p>
                      <span className="font-semibold">טריגר:</span>{" "}
                      {getTriggerDescription(rule)}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold">פעולה:</span>{" "}
                      {getActionDescription(rule)}
                    </p>
                  </div>

                  <div className="absolute bottom-0 inset-x-0 bg-gray-50 px-4 py-4 sm:px-6">
                    <div className="text-sm">
                      <button
                        onClick={() => handleToggle(rule.id, rule.isActive)}
                        className={`font-medium ${
                          rule.isActive
                            ? "text-green-600 hover:text-green-500"
                            : "text-gray-500 hover:text-gray-400"
                        }`}
                      >
                        {rule.isActive
                          ? "פעיל - לחץ לכיבוי"
                          : "כבוי - לחץ להפעלה"}
                      </button>
                    </div>
                  </div>
                </dd>
              </div>
            );
          })}
          {filteredRules.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-lg border-2 border-dashed border-gray-300">
              <p>אין אוטומציות בתיקייה זו.</p>
            </div>
          )}
        </div>

        {isModalOpen && (
          <AutomationModal
            users={users}
            tables={tables}
            currentUserId={currentUserId}
            editingRule={editingRule}
            userPlan={userPlan}
            onClose={() => {
              setIsModalOpen(false);
              setEditingRule(null);
            }}
            onCreated={async () => {
              window.location.reload();
            }}
          />
        )}

        {isMultiEventModalOpen && (
          <MultiEventAutomationModal
            tables={tables}
            users={users}
            currentUserId={currentUserId}
            editingRule={editingRule}
            userPlan={userPlan}
            onClose={() => {
              setIsMultiEventModalOpen(false);
              setEditingRule(null);
            }}
            onCreated={() => window.location.reload()}
          />
        )}

        <AIAutomationCreator
          isOpen={isAIModalOpen}
          onClose={() => setIsAIModalOpen(false)}
          tables={tables}
          users={users}
          currentUserId={currentUserId}
          userPlan={userPlan}
        />
      </div>
    </div>
  );
}
