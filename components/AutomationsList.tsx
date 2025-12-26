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
}

export default function AutomationsList({
  initialRules,
  users,
  tables,
  currentUserId,
}: AutomationsListProps) {
  const [rules, setRules] = useState<AutomationRule[]>(initialRules);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMultiEventModalOpen, setIsMultiEventModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  const router = useRouter();

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

    if (rule.triggerType === "MULTI_EVENT_DURATION") {
      setEditingRule(rule);
      setIsMultiEventModalOpen(true);
    } else {
      setEditingRule(rule);
      setIsModalOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">האוטומציות שלי</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingRule(null);
              setIsAIModalOpen(true);
            }}
            className="inline-flex items-center px-4 py-2 border border-purple-600 text-sm font-medium rounded-md shadow-sm text-white bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            <Sparkles className="ml-2 -mr-1 h-5 w-5" />
            צור אוטומציה עם AI
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
        {rules.map((rule) => {
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
                    {rule.triggerType === "TASK_STATUS_CHANGE"
                      ? "שינוי סטטוס משימה"
                      : rule.triggerType === "NEW_RECORD"
                      ? `רשומה חדשה ב${
                          tables.find(
                            (t) => t.id === Number(rule.triggerConfig.tableId)
                          )?.name || "טבלה לא ידועה"
                        }`
                      : rule.triggerType === "MULTI_EVENT_DURATION"
                      ? "🔥 חישוב אירועים מרובים"
                      : rule.triggerType === "VIEW_METRIC_THRESHOLD"
                      ? "שינוי מדדי תצוגה"
                      : rule.triggerType === "RECORD_FIELD_CHANGE"
                      ? "שינוי ערך בשדה"
                      : rule.triggerType}
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
        {rules.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <p>עדיין לא נוצרו אוטומציות. צור את הראשונה!</p>
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
  );
}
