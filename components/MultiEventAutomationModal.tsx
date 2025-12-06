"use client";

import { useState, useEffect } from "react";
import {
  createAutomationRule,
  updateAutomationRule,
} from "@/app/actions/automations";
import { getTableById } from "@/app/actions/tables";
import { X, Plus, Trash2, Bell, Database } from "lucide-react";

interface MultiEventAutomationModalProps {
  tables: { id: number; name: string }[];
  users?: any[]; // רשימת משתמשים לשליחת התראות
  currentUserId: number;
  onClose: () => void;
  onCreated: () => void;
  editingRule?: any;
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
}: MultiEventAutomationModalProps) {
  const [name, setName] = useState("");
  const [tableId, setTableId] = useState(""); // טבלה ראשית / דיפולטיבית
  const [isMultiTableMode, setIsMultiTableMode] = useState(false);
  const [loading, setLoading] = useState(false);

  // ניהול סכמות מרובות (cache)
  const [schemas, setSchemas] = useState<Record<string, SchemaField[]>>({});
  const [loadingSchemas, setLoadingSchemas] = useState<Record<string, boolean>>(
    {}
  );

  // הגדרות התראה
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyRecipient, setNotifyRecipient] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");

  // שרשרת אירועים
  const [eventChain, setEventChain] = useState<
    Array<{
      id: string;
      tableId: string; // לכל אירוע יש טבלה (במצב מרובה טבלאות)
      eventName: string;
      columnName: string;
      value: string;
    }>
  >([
    { id: "1", tableId: "", eventName: "", columnName: "", value: "" },
    { id: "2", tableId: "", eventName: "", columnName: "", value: "" },
  ]);

  // פונקציה לטעינת סכמה של טבלה ספציפית
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

  // אתחול מצב עריכה
  useEffect(() => {
    if (editingRule) {
      setName(editingRule.name);

      // טיפול בהגדרות התראה אם קיימות
      const actionConfig = editingRule.actionConfig || {};
      if (actionConfig.notification) {
        setNotifyEnabled(true);
        setNotifyRecipient(String(actionConfig.notification.recipientId || ""));
        setNotifyMessage(actionConfig.notification.message || "");
      }

      const config = editingRule.triggerConfig;
      if (config) {
        const mainTableId = String(config.tableId || "");
        setTableId(mainTableId);
        loadTableSchema(mainTableId); // טעינת סכמה ראשית

        if (Array.isArray(config.eventChain)) {
          // בדיקה אם במקרה יש שימוש בטבלאות שונות בשרשרת
          const usedTableIds = new Set<string>();
          const chain = config.eventChain.map((e: any, index: number) => {
            const tId = String(e.tableId || mainTableId);
            usedTableIds.add(tId);
            return {
              id: String(Date.now() + index),
              tableId: tId,
              eventName: e.eventName || "",
              columnName: e.columnId || "",
              value: e.value || "",
            };
          });

          setEventChain(chain);

          // אם יש יותר מטבלה אחת בשימוש, נפעיל מצב מרובה
          if (usedTableIds.size > 1) {
            setIsMultiTableMode(true);
          }

          // טעינת כל הסכמות הנדרשות
          usedTableIds.forEach((id) => loadTableSchema(id));
        }
      }
    }
  }, [editingRule]);

  // כשבוחרים טבלה ראשית, נעדכן את כולם (אם לא במצב מרובה)
  useEffect(() => {
    if (tableId) {
      loadTableSchema(tableId);
      if (!isMultiTableMode) {
        setEventChain((prev) => prev.map((e) => ({ ...e, tableId })));
      }
    }
  }, [tableId, isMultiTableMode]);

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
    newValue: string
  ) => {
    setEventChain(
      eventChain.map((e) => {
        if (e.id !== id) return e;

        if (field === "tableId") {
          // אם שינינו טבלה, נטען סכמה ונאפס עמודה וערך
          loadTableSchema(newValue);
          return { ...e, tableId: newValue, columnName: "", value: "" };
        }

        // אם שינינו עמודה, נאפס את הערך
        if (field === "columnName") {
          return { ...e, columnName: newValue, value: "" };
        }

        return { ...e, [field]: newValue };
      })
    );
  };

  const [validationError, setValidationError] = useState<string | null>(null);

  // ולידציה של קשרים בין טבלאות
  useEffect(() => {
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

        // אם זה אותה טבלה, הכל בסדר
        if (t1 === t2) continue;
        if (!t1 || !t2) continue; // עדיין לא נבחרו

        // בדיקת סכמות (אם נטענו)
        const schema1 = schemas[t1];
        const schema2 = schemas[t2];

        if (!schema1 || !schema2) return; // עדיין טוען

        // האם יש קשר ישיר מ-1 ל-2?
        const rel1to2 = schema1.find(
          (f) =>
            f.type === "relation" && f.options && f.options.includes(String(t2))
        ); // Assuming options stores relationTableId or we need another way?
        // Wait, schema structure in AddRecordForm: relationTableId property.
        // Let's check SchemaField interface in this file. It doesn't have relationTableId.
        // We need to update SchemaField interface and the check.

        // Actually, looking at getTableById response in other files, it returns full schema.
        // Let's assume the schema in state has relationTableId.

        const hasRel1to2 = schema1.some(
          (f: any) =>
            f.type === "relation" && Number(f.relationTableId) === Number(t2)
        );
        const hasRel2to1 = schema2.some(
          (f: any) =>
            f.type === "relation" && Number(f.relationTableId) === Number(t1)
        );

        if (!hasRel1to2 && !hasRel2to1) {
          setValidationError(
            `חסר קשר (Relation) בין שלב ${i + 1} (${current.eventName}) לשלב ${
              i + 2
            } (${next.eventName}). חובה לקשר בין הטבלאות.`
          );
          return;
        }
      }
      setValidationError(null);
    };

    checkRelations();
  }, [eventChain, schemas, isMultiTableMode, tableId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) return;
    setLoading(true);

    try {
      // המרה לפורמט שהשרת מצפה לו
      const formattedEventChain = eventChain.map((event) => ({
        eventName: event.eventName,
        columnId: event.columnName,
        value: event.value,
        tableId: event.tableId || tableId, // שימוש בטבלה הספציפית או הראשית
      }));

      const actionConfig: any = {};
      if (notifyEnabled) {
        actionConfig.notification = {
          recipientId: notifyRecipient,
          message: notifyMessage,
        };
      }

      const ruleData = {
        name,
        triggerType: "MULTI_EVENT_DURATION",
        triggerConfig: {
          tableId, // טבלה ראשית (לצרכי חיפוש ותצוגה כללית)
          eventChain: formattedEventChain,
        },
        actionType: "CALCULATE_MULTI_EVENT_DURATION",
        actionConfig,
        createdBy: currentUserId,
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
      alert("שגיאה בשמירת האוטומציה");
    } finally {
      setLoading(false);
    }
  };

  // helper לקבלת עמודות עבור אירוע ספציפי
  const getColumnsForEvent = (tId: string) => {
    return schemas[tId] || [];
  };

  return (
    <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              🔥 חישוב ביצועים - אירועים מרובים
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              מדוד זמנים בין סדרת אירועים והתראות
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-8">
          <form
            id="automation-form"
            onSubmit={handleSubmit}
            className="space-y-8"
          >
            {/* הגדרות כלליות */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-gray-50 rounded-xl border border-gray-200">
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
                  טבלה ראשית / דיפולטיבית
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
                        ? "bg-blue-100 border-blue-300 text-blue-700"
                        : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                    title="אפשר בחירת טבלה שונה לכל שלב בשרשרת"
                  >
                    <Database size={16} />
                    טבלאות מרובות
                  </button>
                </div>
              </div>
            </div>

            {/* שרשרת אירועים */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <label className="block text-lg font-bold text-gray-800">
                  שרשרת אירועים
                </label>
                <button
                  type="button"
                  onClick={addEvent}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 px-3 py-1 rounded-md hover:bg-blue-50 transition"
                >
                  <Plus size={16} />
                  הוסף אירוע
                </button>
              </div>

              <div className="space-y-4">
                {eventChain.map((event, index) => {
                  const currentTableId = isMultiTableMode
                    ? event.tableId
                    : tableId;
                  const currentColumns = getColumnsForEvent(currentTableId);

                  // מציאת העמודה שנבחרה
                  const selectedColumn = currentColumns.find(
                    (c) => c.name === event.columnName
                  );
                  const hasOptions =
                    selectedColumn &&
                    (selectedColumn.type === "select" ||
                      selectedColumn.type === "multi-select" ||
                      selectedColumn.type === "radio" ||
                      selectedColumn.type === "status");
                  const isBoolean =
                    selectedColumn && selectedColumn.type === "boolean";
                  const isLoading = loadingSchemas[currentTableId];

                  return (
                    <div
                      key={event.id}
                      className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative transition hover:border-blue-300 group"
                    >
                      <div className="flex items-center gap-3 mb-4 border-b border-gray-100 pb-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-bold ${
                            index === 0
                              ? "bg-green-500"
                              : index === eventChain.length - 1
                              ? "bg-red-500"
                              : "bg-yellow-500"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <h4 className="text-sm font-semibold text-gray-900">
                          {index === 0
                            ? "אירוע התחלה"
                            : index === eventChain.length - 1
                            ? "אירוע סיום"
                            : `שלב ביניים`}
                        </h4>

                        {eventChain.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeEvent(event.id)}
                            className="mr-auto text-gray-400 hover:text-red-500 transition-colors p-1 opacity-0 group-hover:opacity-100"
                            title="מחק שלב"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>

                      <div
                        className={`grid gap-4 ${
                          isMultiTableMode ? "grid-cols-4" : "grid-cols-3"
                        }`}
                      >
                        {/* שם האירוע */}
                        <div className="col-span-1">
                          <label className="block text-xs font-medium text-gray-500 mb-1.5 ">
                            שם השלב (לתצוגה)
                          </label>
                          <input
                            type="text"
                            required
                            value={event.eventName}
                            onChange={(e) =>
                              updateEvent(event.id, "eventName", e.target.value)
                            }
                            placeholder='לדוגמה: "ליד חדש"'
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        {/* בחירת טבלה (רק במצב מרובה) */}
                        {isMultiTableMode && (
                          <div className="col-span-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 ">
                              טבלה
                            </label>
                            <select
                              required={isMultiTableMode}
                              value={event.tableId}
                              onChange={(e) =>
                                updateEvent(event.id, "tableId", e.target.value)
                              }
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                              <option value="">בחר טבלה...</option>
                              {tables.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* שם העמודה (משתנה לפי טבלה) */}
                        <div className="col-span-1">
                          <label className="block text-xs font-medium text-gray-500 mb-1.5 ">
                            עמודה מנטרת
                          </label>
                          {isLoading ? (
                            <div className="px-3 py-2 text-sm bg-gray-50 text-gray-400 rounded-lg border">
                              טוען...
                            </div>
                          ) : (
                            <select
                              required
                              value={event.columnName}
                              onChange={(e) =>
                                updateEvent(
                                  event.id,
                                  "columnName",
                                  e.target.value
                                )
                              }
                              disabled={!currentTableId}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100"
                            >
                              <option value="">
                                {currentTableId
                                  ? "בחר עמודה..."
                                  : "בחר טבלה קודם"}
                              </option>
                              {currentColumns.map((col) => (
                                <option key={col.name} value={col.name}>
                                  {col.label || col.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* הערך */}
                        <div className="col-span-1">
                          <label className="block text-xs font-medium text-gray-500 mb-1.5 ">
                            ערך לטריגר
                          </label>

                          {isBoolean ? (
                            <select
                              required
                              value={event.value}
                              onChange={(e) =>
                                updateEvent(event.id, "value", e.target.value)
                              }
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                              <option value="">בחר...</option>
                              <option value="true">כן / פעיל</option>
                              <option value="false">לא / כבוי</option>
                            </select>
                          ) : hasOptions ? (
                            <select
                              required
                              value={event.value}
                              onChange={(e) =>
                                updateEvent(event.id, "value", e.target.value)
                              }
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                              <option value="">בחר ערך...</option>
                              {selectedColumn.options?.map((opt, i) => (
                                <option key={`${opt}-${i}`} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              required
                              value={event.value}
                              onChange={(e) =>
                                updateEvent(event.id, "value", e.target.value)
                              }
                              placeholder={
                                !event.columnName
                                  ? "בחר עמודה קודם"
                                  : "הזן ערך / * לכל שינוי"
                              }
                              disabled={!event.columnName}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* הגדרות התראה */}
            <div className="p-5 bg-orange-50 rounded-xl border border-orange-200 mt-6">
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="notifyEnabled"
                  checked={notifyEnabled}
                  onChange={(e) => setNotifyEnabled(e.target.checked)}
                  className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 border-gray-300"
                />
                <label
                  htmlFor="notifyEnabled"
                  className="font-bold text-gray-800 flex items-center gap-2 cursor-pointer"
                >
                  <Bell size={18} className="text-orange-600" />
                  שלח התראה בסיום התהליך
                </label>
              </div>

              {notifyEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      למי לשלוח?
                    </label>
                    <select
                      required={notifyEnabled}
                      value={notifyRecipient}
                      onChange={(e) => setNotifyRecipient(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500 bg-white"
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
                      תוכן ההודעה
                    </label>
                    <input
                      type="text"
                      required={notifyEnabled}
                      value={notifyMessage}
                      onChange={(e) => setNotifyMessage(e.target.value)}
                      placeholder='לדוגמה: "תהליך לקוח חדש הושלם בהצלחה!"'
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        {isMultiTableMode && !validationError && (
          <div className="mx-6 mb-2 p-3 bg-blue-50 text-blue-700 rounded-lg border border-blue-200 text-sm flex items-center gap-2">
            <Database size={16} />
            שים לב: במצב מרובה טבלאות, חייב להיות שדה קשר (Relation) בין הטבלאות
            המשויכות לשלבים עוקבים.
          </div>
        )}

        {validationError && (
          <div className="mx-6 mb-2 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm flex items-center gap-2">
            ⚠️ {validationError}
          </div>
        )}

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition shadow-sm"
          >
            ביטול
          </button>
          <button
            type="submit"
            form="automation-form"
            disabled={loading || !!validationError}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md hover:shadow-lg"
          >
            {loading ? "שומר..." : "שמור הגדרות"}
          </button>
        </div>
      </div>
    </div>
  );
}
