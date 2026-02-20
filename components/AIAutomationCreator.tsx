"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createAutomationRule } from "@/app/actions/automations";
import { useAIJob } from "@/hooks/use-ai-job";
import { toast } from "sonner";
import { getUserFriendlyError, getFriendlyResultError } from "@/lib/errors";
import AutomationFlowPreview from "@/components/automation-flow/AutomationFlowPreview";
import AutomationModal from "@/components/AutomationModal";
import {
  type AutomationSchema,
  TRIGGER_LABELS,
  ACTION_LABELS,
  CATEGORY_LABELS,
} from "@/components/automation-flow/field-configs";

const INITIAL_GREETING: Message = {
  role: "model",
  content:
    "שלום! תאר לי מה אתה רוצה שהאוטומציה תעשה, ואני אצור אותה עבורך. אני יכול ליצור כל סוג אוטומציה - התראות, משימות, וואטסאפ, webhooks ועוד.",
};

interface Message {
  role: "user" | "model";
  content: string;
}

interface AIAutomationCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  tables: { id: number; name: string; schemaJson: any }[];
  users: { id: number; name: string }[];
  currentUserId: number;
  userPlan?: string;
}

export default function AIAutomationCreator({
  isOpen,
  onClose,
  tables,
  users,
  currentUserId,
  userPlan = "basic",
}: AIAutomationCreatorProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSchema, setCurrentSchema] = useState<AutomationSchema | null>(null);
  const [creating, setCreating] = useState(false);
  const [suggestions, setSuggestions] = useState<AutomationSchema[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showManualWizard, setShowManualWizard] = useState(false);
  const { dispatch, cancel } = useAIJob();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Cancel polling when modal closes
  useEffect(() => {
    if (!isOpen) cancel();
  }, [isOpen, cancel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleChatFocus = useCallback(() => {
    chatInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => chatInputRef.current?.focus(), 300);
  }, []);

  const handleSchemaChange = useCallback((updatedSchema: AutomationSchema) => {
    setCurrentSchema(updatedSchema);
  }, []);

  const handleReset = useCallback(() => {
    cancel();
    setCurrentSchema(null);
    setSuggestions([]);
    setMessages([INITIAL_GREETING]);
    setInput("");
  }, [cancel]);

  const handleEdit = useCallback(() => {
    setShowManualWizard(true);
  }, []);

  const handleSend = async (text?: string) => {
    const messageToSend = text || input;
    if (!messageToSend.trim() || loading) return;

    const isModify = !!currentSchema;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: messageToSend }]);
    setLoading(true);

    try {
      const payload: Record<string, any> = { prompt: messageToSend, mode: "create" };
      if (isModify && currentSchema) {
        payload.currentSchema = currentSchema;
      }

      const data = await dispatch<{ automation: AutomationSchema }>(
        "/api/ai/generate-automation",
        payload
      );

      if (data.automation && data.automation.triggerType && data.automation.actionType) {
        setCurrentSchema(data.automation);
        setSuggestions([]);
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content: isModify
              ? `עדכנתי את האוטומציה "${data.automation.name}". בדוק את השינויים בתצוגה המקדימה.`
              : `יצרתי את האוטומציה "${data.automation.name}". בדוק את התצוגה מקדימה בצד ימין.`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content: "לא הצלחתי ליצור אוטומציה מהבקשה הזו. תוכל לנסות להיות יותר ספציפי?",
          },
        ]);
      }
      setLoading(false);
    } catch (error: any) {
      if (error?.name === "AbortError" || error?.message === "Aborted") {
        setLoading(false);
        return;
      }
      console.error(error);
      const isRateLimited = error?.message === "RATE_LIMITED" || error?.message?.includes("Rate limit");
      setMessages((prev) => [
        ...prev,
        { role: "model", content: isRateLimited
          ? "הגעת למגבלת הבקשות. אנא המתן דקה ונסה שוב."
          : "מצטער, משהו השתבש. אנא נסה שוב." },
      ]);
      setLoading(false);
    }
  };

  const handleGetSuggestions = async () => {
    if (loadingSuggestions || loading) return;
    setLoadingSuggestions(true);

    try {
      const data = await dispatch<{ suggestions: AutomationSchema[] }>(
        "/api/ai/generate-automation",
        { prompt: "", mode: "suggest" }
      );

      if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content: `מצאתי ${data.suggestions.length} אוטומציות מומלצות עבורך! בחר אחת מהכרטיסיות בצד ימין.`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "model", content: "לא הצלחתי לייצר הצעות. נסה לתאר מה אתה צריך." },
        ]);
      }
    } catch (error: any) {
      if (error?.name === "AbortError" || error?.message === "Aborted") {
        setLoadingSuggestions(false);
        return;
      }
      console.error(error);
      const isRateLimited = error?.message === "RATE_LIMITED" || error?.message?.includes("Rate limit");
      setMessages((prev) => [
        ...prev,
        { role: "model", content: isRateLimited
          ? "הגעת למגבלת הבקשות. אנא המתן דקה ונסה שוב."
          : "מצטער, משהו השתבש בעת יצירת הצעות. אנא נסה שוב." },
      ]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSelectSuggestion = (suggestion: AutomationSchema) => {
    setCurrentSchema(suggestion);
    setSuggestions([]);
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
        toast.error(getFriendlyResultError(result.error, "שגיאה ביצירת האוטומציה"));
      }
    } catch (e) {
      toast.error(getUserFriendlyError(e));
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  const showRightPanel = currentSchema || suggestions.length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-6xl h-[80vh] rounded-3xl shadow-2xl flex overflow-hidden border border-gray-100 flex-col md:flex-row">
        {/* Chat Section */}
        <div
          className={`flex flex-col flex-1 h-full ${
            showRightPanel
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
                תאר מה אתה רוצה, או קבל הצעות חכמות.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition p-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/30">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
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
            {(loading || loadingSuggestions) && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 px-5 py-3.5 rounded-2xl rounded-bl-none shadow-sm flex gap-2 items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-.3s]"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-.5s]"></div>
                </div>
              </div>
            )}
            {tables.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
                <div className="bg-orange-100 p-4 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-600">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-800">אין טבלאות זמינות</h3>
                <p className="text-gray-500 max-w-sm">כדי ליצור אוטומציות, עליך ליצור קודם טבלאות במערכת.</p>
              </div>
            )}

            {/* Quick suggestions + Smart Suggestions button */}
            {messages.length === 1 && tables.length > 0 && !loading && !loadingSuggestions && (
              <div className="space-y-4 px-2">
                {/* Smart Suggestions Button */}
                <button
                  onClick={handleGetSuggestions}
                  className="w-full p-4 bg-linear-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl font-medium flex items-center justify-center gap-3"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                  </svg>
                  קבל הצעות חכמות מבוססות על הנתונים שלך
                </button>

                {/* Quick text suggestions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(() => {
                    const quickSuggestions: string[] = [];
                    tables.forEach((table) => {
                      const columns: any[] = Array.isArray(table.schemaJson) ? table.schemaJson : [];
                      const statusCol = columns.find(
                        (c: any) => c.name?.toLowerCase().includes("status") || c.type === "select"
                      );
                      if (statusCol) {
                        quickSuggestions.push(
                          `שלח התראה כש${statusCol.label || statusCol.name} בטבלת ${table.name} משתנה`
                        );
                      }
                      quickSuggestions.push(`התראה על יצירת רשומה חדשה ב${table.name}`);
                    });
                    if (quickSuggestions.length < 2) {
                      quickSuggestions.push("צור משימה למנהל כשעסקה חדשה נסגרת");
                    }
                    return quickSuggestions.sort(() => 0.5 - Math.random()).slice(0, 4);
                  })().map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(s)}
                      className="text-right text-sm p-3 bg-white border border-gray-200 rounded-xl hover:border-purple-400 hover:shadow-md transition-all text-gray-600 hover:text-purple-600"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-gray-100">
            <div className="relative">
              <input
                ref={chatInputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={
                  currentSchema
                    ? "בקש שינוי, לדוגמה: הוסף שליחת וואטסאפ..."
                    : tables.length > 0
                    ? "לדוגמה: שלח וואטסאפ כשרשומה חדשה נוצרת בטבלת לידים..."
                    : "נא ליצור טבלאות קודם"
                }
                disabled={tables.length === 0}
                className="w-full pl-5 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition text-gray-800 shadow-inner disabled:bg-gray-100 disabled:text-gray-400"
              />
              {tables.length > 0 && (
                <button
                  onClick={() => handleSend()}
                  disabled={loading || loadingSuggestions || !input.trim()}
                  className="absolute right-2 top-2 p-2 bg-linear-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50 shadow-md"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Preview OR Suggestions */}
        {showRightPanel && (
          <div className="flex-1 bg-white border-l border-gray-100 flex flex-col md:w-1/2 h-full min-h-0 overflow-hidden">
            {/* Suggestions View */}
            {suggestions.length > 0 && !currentSchema && (
              <div className="flex-1 overflow-y-auto p-8 flex flex-col">
                <div className="mb-6 pb-4 border-b border-gray-100">
                  <div className="text-xs font-bold text-purple-600 uppercase tracking-widest mb-1">
                    הצעות חכמות
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {suggestions.length} אוטומציות מומלצות
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">בחר אוטומציה להצגה מקדימה ושמירה</p>
                </div>
                <div className="flex-1 space-y-3">
                  {suggestions.map((s, i) => {
                    const cat = s.category ? CATEGORY_LABELS[s.category] : null;
                    return (
                      <button
                        key={i}
                        onClick={() => handleSelectSuggestion(s)}
                        className="w-full text-right p-4 bg-gray-50 border border-gray-200 rounded-xl hover:border-purple-400 hover:bg-purple-50/50 hover:shadow-md transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="font-semibold text-gray-800 group-hover:text-purple-700 text-sm">
                            {s.name}
                          </h4>
                          {cat && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${cat.color}`}>
                              {cat.label}
                            </span>
                          )}
                        </div>
                        {s.description && (
                          <p className="text-xs text-gray-500 mb-2">{s.description}</p>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px]">
                            {TRIGGER_LABELS[s.triggerType] || s.triggerType}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 rounded text-[10px]">
                            {ACTION_LABELS[s.actionType] || s.actionType}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Flow Preview */}
            {currentSchema && (
              <AutomationFlowPreview
                schema={currentSchema}
                onSchemaChange={handleSchemaChange}
                tables={tables}
                users={users}
                onChatFocus={handleChatFocus}
                creating={creating}
                onReset={handleReset}
                onEdit={handleEdit}
                onCreate={handleCreate}
                userPlan={userPlan}
              />
            )}
          </div>
        )}
      </div>

      {showManualWizard && currentSchema && (
        <AutomationModal
          users={users}
          tables={tables.map(({ id, name }) => ({ id, name }))}
          currentUserId={currentUserId}
          onClose={() => setShowManualWizard(false)}
          onCreated={() => {
            setShowManualWizard(false);
            onClose();
            router.refresh();
          }}
          initialSchema={{
            name: currentSchema.name,
            triggerType: currentSchema.triggerType,
            triggerConfig: currentSchema.triggerConfig,
            actionType: currentSchema.actionType,
            actionConfig: currentSchema.actionConfig,
          }}
          userPlan={userPlan}
        />
      )}
    </div>
  );
}
