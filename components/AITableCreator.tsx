"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Message {
  role: "user" | "model";
  content: string;
}

interface FieldRow {
  name: string;
  type: string;
  label: string;
  options?: string;
  defaultValue?: string;
  relationTableId?: number;
  displayField?: string;
  allowMultiple?: boolean;
}

interface TableSchema {
  tableName: string;
  slug: string;
  description?: string;
  fields: FieldRow[];
}

interface AITableCreatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AITableCreator({
  isOpen,
  onClose,
}: AITableCreatorProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      content:
        "Hi! Describe the table you want to create, and I'll design it for you.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSchema, setCurrentSchema] = useState<TableSchema | null>(null);
  const [existingTablesStr, setExistingTablesStr] = useState("");
  const [creating, setCreating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Load context
      const loadContext = async () => {
        try {
          const { getTables } = await import("@/app/actions");
          const res = await getTables();
          if (res.success && res.data) {
            const tablesSummary = res.data
              .map((t) => `${t.name} (ID: ${t.id})`)
              .join(", ");
            setExistingTablesStr(tablesSummary);
          }
        } catch (e) {
          console.error("Failed to load tables context", e);
        }
      };
      loadContext();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const messageToSend = text || input;
    if (!messageToSend.trim() || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: messageToSend }]);
    setLoading(true);

    try {
      const response = await fetch("/api/ai/generate-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: messageToSend,
          existingTables: existingTablesStr,
          currentSchema: currentSchema,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate schema");
      }

      if (data.schema) {
        setCurrentSchema(data.schema);
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content: `I've ${
              currentSchema ? "updated" : "created"
            } the schema for "${
              data.schema.tableName
            }". Check the preview on the right.`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content:
              "I couldn't generate a schema from that. Could you try being more specific?",
          },
        ]);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: "Sorry, something went wrong. Please try again.",
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
      // Transform fields for createTable
      // The schema returns options as string "A, B, C", which fits the action expectation if we transform it to array if needed?
      // Wait, CreateTableForm sends `options` as string[] for manual input but the API might handle it.
      // Re-checking CreateTableForm:
      // const schemaJson = fields.map((f) => ({ ... options: [...] }))
      // The action expects `schemaJson` to be Record<string, unknown>, usually an array of fields.
      // CreateTableForm parses the CSV string into array before sending.
      // My AI prompt asks for "comma separated string" for options.
      // So I should convert it to array here to match CreateTableForm logic.

      const refinedFields = currentSchema.fields.map((f) => ({
        ...f,
        options: f.options
          ? f.options
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        // Ensure strictly typed values for creating table
        relationTableId: f.relationTableId
          ? Number(f.relationTableId)
          : undefined,
      }));

      const { createTable } = await import("@/app/actions");
      const result = await createTable({
        name: currentSchema.tableName,
        slug: currentSchema.slug,
        schemaJson: refinedFields as any,
        categoryId: undefined, // AI doesn't categorize for now
      });

      if (result.success) {
        onClose();
        router.refresh();
      } else {
        alert("Failed to create table: " + result.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error creating table");
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

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
          <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <span className="text-2xl">✨</span> AI Table Creator
              </h2>
              <p className="text-sm text-gray-500">
                Describe what you need, I'll build it.
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
            {messages.length === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-2">
                {[
                  "טבלת לידים לסוכנות שיווק (שם, טלפון, מקור, סטטוס, תקציב)",
                  "מעקב הוצאות והכנסות (תאריך, סכום, קטגוריה, סוג, חשבונית)",
                  "ניהול מלאי מוצרים (שם, מק'ט, כמות, מחיר עלות, מחיר מכירה, ספק)",
                  "ניהול פרויקטים ומשימות (שם משימה, אחראי, דד-ליין, עדיפות, סטטוס)",
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    className="text-right text-sm p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all text-gray-600 hover:text-blue-600"
                  >
                    {s}
                  </button>
                ))}
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
                placeholder="e.g., A CRM table for Real Estate leads..."
                className="w-full pl-5 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-800 shadow-inner"
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="absolute right-2 top-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:hover:bg-blue-600 shadow-md"
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
                  <div className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">
                    Preview
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {currentSchema.tableName}
                  </h3>
                </div>
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-mono">
                  {currentSchema.slug}
                </span>
              </div>
              {currentSchema.description && (
                <p className="text-gray-500">{currentSchema.description}</p>
              )}
            </div>

            <div className="flex-1 space-y-3 mb-6 overflow-y-auto pr-2">
              <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Fields ({currentSchema.fields.length})
              </h4>
              {currentSchema.fields.map((field, idx) => (
                <div
                  key={idx}
                  className="bg-gray-50 border border-gray-100 rounded-lg p-3 flex items-center justify-between group hover:border-blue-200 transition"
                >
                  <div>
                    <div className="font-medium text-gray-800">
                      {field.label}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">
                      {field.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-white text-gray-500 border border-gray-200 px-2 py-0.5 rounded shadow-sm">
                      {field.type}
                    </span>
                    {field.options && (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                        List
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setCurrentSchema(null)}
                className="flex-1 py-3 px-4 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition"
              >
                Discard
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-2 py-3 px-4 bg-linear-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 font-medium shadow-lg hover:shadow-xl transition disabled:opacity-70 flex justify-center items-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Creating Table...
                  </>
                ) : (
                  <>
                    <span className="text-lg">+</span> Create Table
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
