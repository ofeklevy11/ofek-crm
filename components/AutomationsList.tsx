"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AutomationModal from "@/components/AutomationModal";
import MultiEventAutomationModal from "@/components/MultiEventAutomationModal";
import AIAutomationCreator from "@/components/AIAutomationCreator";
import {
  deleteAutomationRule,
  toggleAutomationRule,
} from "@/app/actions/automations";
import { Plus, Trash2, Power, Edit, Zap, Sparkles } from "lucide-react";

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
}

interface AutomationsListProps {
  initialRules: AutomationRule[];
  users: any[];
  tables: { id: number; name: string; schemaJson: any }[];
  currentUserId: number;
  folders?: { id: number; name: string; _count?: any }[];
}

export default function AutomationsList({
  initialRules,
  users,
  tables,
  currentUserId,
  folders: propsFolders = [],
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
    if (!confirm("Are you sure? automations inside will be unassigned."))
      return;
    const { deleteFolder } = await import("@/app/actions/folders");
    await deleteFolder(folderId);
    setLocalFolders(localFolders.filter((f) => f.id !== folderId));
    if (selectedFolderId === folderId) setSelectedFolderId(null);
  };

  const handleMoveToFolder = async (
    ruleId: number,
    folderId: number | null
  ) => {
    const { moveItemToFolder } = await import("@/app/actions/folders");
    await moveItemToFolder(ruleId, folderId, "AUTOMATION");
    const updatedRules = rules.map((r) =>
      r.id === ruleId ? { ...r, folderId } : r
    );
    setRules(updatedRules);
  };

  const handleDelete = async (id: number) => {
    if (confirm("האם אתה בטוח שברצונך למחוק אוטומציה זו?")) {
      await deleteAutomationRule(id);
      setRules(rules.filter((r) => r.id !== id));
    }
  };

  const handleToggle = async (id: number, currentStatus: boolean) => {
    await toggleAutomationRule(id, !currentStatus);
    setRules(
      rules.map((r) => (r.id === id ? { ...r, isActive: !currentStatus } : r))
    );
  };

  const handleEdit = (rule: AutomationRule) => {
    if (
      rule.actionType === "ADD_TO_NURTURE_LIST" &&
      rule.actionConfig?.listId
    ) {
      router.push(
        `/nurture-hub/${rule.actionConfig.listId}?openAutomation=true`
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

      case "TASK_STATUS_CHANGE":
        return "שינוי סטטוס משימה";

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

      default:
        return rule.triggerType;
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
        <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            {selectedFolderId
              ? localFolders.find((f) => f.id === selectedFolderId)?.name
              : "כל האוטומציות"}
          </h2>
          <div className="flex gap-2">
            <button
              disabled
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-500 bg-gray-100 cursor-not-allowed"
            >
              <Sparkles className="ml-2 -mr-1 h-5 w-5 text-gray-400" />
              צור אוטומציה עם AI (בקרוב...)
            </button>
            <button
              onClick={() => {
                setEditingRule(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
                  vip: "לקוחות VIP",
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
                    (t) => t.id === Number(tableId)
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
              } else {
                // Fallback simple translation
                displayName = displayName.replace(
                  "Nurture Auto-Add:",
                  "הוספה אוטומטית:"
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
                    <div className="relative group/move">
                      <button className="text-gray-400 hover:text-blue-500">
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
                      <div className="absolute left-0 mt-1 w-40 bg-white border border-gray-200 shadow-lg rounded-md hidden group-hover/move:block z-20">
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
                    {rule.actionType === "SEND_NOTIFICATION" && (
                      <p>
                        <span className="font-semibold">נשלח ל:</span>{" "}
                        {users.find(
                          (u) => u.id === rule.actionConfig?.recipientId
                        )?.name || "לא ידוע"}
                      </p>
                    )}
                    {rule.actionType === "CALCULATE_MULTI_EVENT_DURATION" && (
                      <p className="text-xs text-orange-600 mt-1">
                        מודד זמנים בין שרשרת אירועים
                      </p>
                    )}
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
            onClose={() => {
              setIsMultiEventModalOpen(false);
              setEditingRule(null);
            }}
            onCreated={() => window.location.reload()}
          />
        )}

        {isAIModalOpen && (
          <AIAutomationCreator
            isOpen={isAIModalOpen}
            onClose={() => setIsAIModalOpen(false)}
            tables={tables}
            users={users}
            currentUserId={currentUserId}
          />
        )}
      </div>
    </div>
  );
}
