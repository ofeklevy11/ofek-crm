"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createAutomationRule } from "@/app/actions/automations";

interface Message {
  role: "user" | "model";
  content: string;
}

interface AutomationSchema {
  name: string;
  triggerType: string;
  triggerConfig: any;
  actionType: string;
  actionConfig: any;
}

interface AIAutomationCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  tables: { id: number; name: string; schemaJson: any }[];
  users: { id: number; name: string }[];
  currentUserId: number;
}

export default function AIAutomationCreator({
  isOpen,
  onClose,
  tables,
  users,
  currentUserId,
}: AIAutomationCreatorProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      content:
        "שלום! תאר לי מה אתה רוצה שהאוטומציה תעשה, ואני אצור אותה עבורך. אני יכול ליצור אוטומציות רגילות ואוטומציות מרובות אירועים.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSchema, setCurrentSchema] = useState<AutomationSchema | null>(
    null
  );
  const [creating, setCreating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const tablesStr = tables
        .map((t) => {
          let columnsStr = "";
          if (Array.isArray(t.schemaJson)) {
            columnsStr = t.schemaJson
              .map((c: any) => `${c.name} (ID: ${c.id}, Type: ${c.type})`)
              .join(", ");
          }
          return `Table: ${t.name} (ID: ${t.id}) [Columns: ${columnsStr}]`;
        })
        .join("\n");
      const usersStr = users.map((u) => `${u.name} (ID: ${u.id})`).join(", ");

      const response = await fetch("/api/ai/generate-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMsg,
          tables: tablesStr,
          users: usersStr,
          existingAutomations: "",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate automation");
      }

      if (data.automation) {
        setCurrentSchema(data.automation);
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content: `יצרתי את האוטומציה "${data.automation.name}". בדוק את התצוגה מקדימה בצד ימין.`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content:
              "לא הצלחתי ליצור אוטומציה מהבקשה הזו. תוכל לנסות להיות יותר ספציפי?",
          },
        ]);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: "מצטער, משהו השתבש. אנא נסה שוב.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!currentSchema) return;
    setCreating(true);

    try {
      const result = await createAutomationRule({
        name: currentSchema.name,
        triggerType: currentSchema.triggerType,
        triggerConfig: currentSchema.triggerConfig,
        actionType: currentSchema.actionType,
        actionConfig: currentSchema.actionConfig,
      });

      if (result.success) {
        onClose();
        router.refresh();
      } else {
        alert("Failed to create automation: " + result.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error creating automation");
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  const renderTriggerInfo = () => {
    if (!currentSchema) return null;

    const { triggerType, triggerConfig } = currentSchema;

    switch (triggerType) {
      case "NEW_RECORD":
        const table = tables.find(
          (t) => t.id === Number(triggerConfig.tableId)
        );
        return (
          <div>
            <span className="font-semibold">טריגר:</span> רשומה חדשה ב
            {table?.name || "טבלה לא ידועה"}
            {triggerConfig.field && (
              <div className="text-xs mt-1">
                שדה: {triggerConfig.field}
                {triggerConfig.value && ` = ${triggerConfig.value}`}
              </div>
            )}
          </div>
        );

      case "RECORD_FIELD_CHANGE":
        const updateTable = tables.find(
          (t) => t.id === Number(triggerConfig.tableId)
        );
        return (
          <div>
            <span className="font-semibold">טריגר:</span> שינוי שדה
            <div className="text-xs mt-1">
              טבלה: {updateTable?.name || "טבלה לא ידועה"}
            </div>
            <div className="text-xs mt-1">עמודה: {triggerConfig.columnId}</div>
            {triggerConfig.fromValue && (
              <div className="text-xs mt-1">מ: {triggerConfig.fromValue}</div>
            )}
            {triggerConfig.toValue && (
              <div className="text-xs mt-1">ל: {triggerConfig.toValue}</div>
            )}
          </div>
        );

      case "TASK_STATUS_CHANGE":
        return (
          <div>
            <span className="font-semibold">טריגר:</span> שינוי סטטוס משימה
            {triggerConfig.fromStatus && (
              <div className="text-xs mt-1">מ: {triggerConfig.fromStatus}</div>
            )}
            {triggerConfig.toStatus && (
              <div className="text-xs mt-1">ל: {triggerConfig.toStatus}</div>
            )}
          </div>
        );

      case "MULTI_EVENT_DURATION":
        const eventCount =
          triggerConfig.eventChain?.length || triggerConfig.events?.length || 0;
        return (
          <div>
            <span className="font-semibold">טריגר:</span> 🔥 אירועים מרובים
            <div className="text-xs mt-1">{eventCount} אירועים בשרשרת</div>
          </div>
        );

      default:
        return (
          <div>
            <span className="font-semibold">טריגר:</span> {triggerType}
          </div>
        );
    }
  };

  const renderActionInfo = () => {
    if (!currentSchema) return null;

    const { actionType, actionConfig } = currentSchema;

    switch (actionType) {
      case "SEND_NOTIFICATION":
        const recipient = users.find(
          (u) => u.id === Number(actionConfig.recipientId)
        );
        return (
          <div>
            <span className="font-semibold">פעולה:</span> שליחת התראה
            <div className="text-xs mt-1">
              למשתמש: {recipient?.name || "לא ידוע"}
            </div>
            {actionConfig.title && (
              <div className="text-xs mt-1">כותרת: {actionConfig.title}</div>
            )}
          </div>
        );

      case "CREATE_TASK":
        const assignee = users.find(
          (u) => u.id === Number(actionConfig.assigneeId)
        );
        return (
          <div>
            <span className="font-semibold">פעולה:</span> יצירת משימה
            <div className="text-xs mt-1">
              למשתמש: {assignee?.name || "לא ידוע"}
            </div>
            {actionConfig.title && (
              <div className="text-xs mt-1">כותרת: {actionConfig.title}</div>
            )}
          </div>
        );

      case "CALCULATE_DURATION":
        return (
          <div>
            <span className="font-semibold">פעולה:</span> חישוב משך זמן
            <div className="text-xs mt-1">
              מ: {actionConfig.fromField || actionConfig.fromValue}
            </div>
            <div className="text-xs mt-1">
              ל: {actionConfig.toField || actionConfig.toValue}
            </div>
          </div>
        );

      case "CALCULATE_MULTI_EVENT_DURATION":
        return (
          <div>
            <span className="font-semibold">פעולה:</span> חישוב זמנים מרובים
            <div className="text-xs mt-1">מדידת זמנים בין אירועים</div>
          </div>
        );

      default:
        return (
          <div>
            <span className="font-semibold">פעולה:</span> {actionType}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-6xl h-[80vh] rounded-3xl shadow-2xl flex overflow-hidden border border-gray-100 flex-col md:flex-row">
        {/* Chat Section */}
        <div
          className={`flex flex-col flex-1 h-full ${
            currentSchema
              ? "md:w-1/2 border-b md:border-b-0 md:border-r border-gray-200"
              : "w-full"
          }`}
        >
          <div className="p-6 border-b border-gray-100 bg-linear-to-r from-purple-50 to-blue-50 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <span className="text-2xl">🤖</span> צור אוטומציה עם AI
              </h2>
              <p className="text-sm text-gray-500">
                תאר מה אתה רוצה, ואני אצור את זה.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition p-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/30">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-5 py-3.5 shadow-sm ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-white border border-gray-100 text-gray-800 rounded-bl-none"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 px-5 py-3.5 rounded-2xl rounded-bl-none shadow-sm flex gap-2 items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-.3s]"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-.5s]"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-gray-100">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="לדוגמה: צור התראה כשנוספת רשומה חדשה בטבלת לקוחות..."
                className="w-full pl-5 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition text-gray-800 shadow-inner"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="absolute right-2 top-2 p-2 bg-linear-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50 shadow-md"
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
                >
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Preview Section */}
        {currentSchema && (
          <div className="flex-1 overflow-y-auto bg-white border-l border-gray-100 p-8 flex flex-col md:w-1/2 h-full">
            <div className="mb-6 pb-6 border-b border-gray-100">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-xs font-bold text-purple-600 uppercase tracking-widest mb-1">
                    תצוגה מקדימה
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {currentSchema.name}
                  </h3>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    currentSchema.triggerType === "MULTI_EVENT_DURATION"
                      ? "bg-orange-100 text-orange-600"
                      : "bg-blue-100 text-blue-600"
                  }`}
                >
                  {currentSchema.triggerType === "MULTI_EVENT_DURATION"
                    ? "🔥 מרובה אירועים"
                    : "רגילה"}
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-4 mb-6">
              <div className="bg-linear-to-br from-blue-50 to-purple-50 border border-blue-100 rounded-lg p-4">
                <div className="text-sm text-gray-700">
                  {renderTriggerInfo()}
                </div>
              </div>

              <div className="bg-linear-to-br from-green-50 to-emerald-50 border border-green-100 rounded-lg p-4">
                <div className="text-sm text-gray-700">
                  {renderActionInfo()}
                </div>
              </div>

              {/* Show detailed config */}
              <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <summary className="cursor-pointer font-semibold text-gray-700 text-sm">
                  הצג קונפיגורציה מלאה
                </summary>
                <pre className="mt-2 text-xs bg-white p-3 rounded border border-gray-200 overflow-x-auto">
                  {JSON.stringify(currentSchema, null, 2)}
                </pre>
              </details>
            </div>

            <div className="pt-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setCurrentSchema(null)}
                className="flex-1 py-3 px-4 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition"
              >
                ביטול
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-2 py-3 px-4 bg-linear-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 font-medium shadow-lg hover:shadow-xl transition disabled:opacity-70 flex justify-center items-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    יוצר אוטומציה...
                  </>
                ) : (
                  <>
                    <span className="text-lg">+</span> צור אוטומציה
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
