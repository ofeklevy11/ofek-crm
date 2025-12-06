"use client";

import { useState, useEffect } from "react";
import { createAutomationRule } from "@/app/actions/automations";
import { getTableById } from "@/app/actions/tables";
import { X, Plus, Trash2 } from "lucide-react";

interface MultiEventAutomationModalProps {
  tables: { id: number; name: string }[];
  currentUserId: number;
  onClose: () => void;
  onCreated: () => void;
}

interface SchemaField {
  name: string;
  type: string;
  label: string;
  options?: string[];
}

export default function MultiEventAutomationModal({
  tables,
  currentUserId,
  onClose,
  onCreated,
}: MultiEventAutomationModalProps) {
  const [name, setName] = useState("");
  const [tableId, setTableId] = useState("");
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<SchemaField[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  // טעינת עמודות כשבוחרים טבלה
  useEffect(() => {
    async function fetchColumns() {
      if (!tableId) {
        setColumns([]);
        return;
      }

      setLoadingColumns(true);
      try {
        const result = await getTableById(Number(tableId));
        if (
          result.success &&
          result.data &&
          Array.isArray(result.data.schemaJson)
        ) {
          setColumns(result.data.schemaJson as any);
        } else {
          setColumns([]);
        }
      } catch (error) {
        console.error("Failed to load table schema", error);
        setColumns([]);
      } finally {
        setLoadingColumns(false);
      }
    }

    fetchColumns();
  }, [tableId]);

  // שרשרת אירועים
  const [eventChain, setEventChain] = useState<
    Array<{
      id: string;
      eventName: string;
      columnName: string;
      value: string;
    }>
  >([
    { id: "1", eventName: "", columnName: "", value: "" },
    { id: "2", eventName: "", columnName: "", value: "" },
  ]);

  const addEvent = () => {
    setEventChain([
      ...eventChain,
      {
        id: Date.now().toString(),
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
    field: "eventName" | "columnName" | "value",
    newValue: string
  ) => {
    setEventChain(
      eventChain.map((e) => {
        if (e.id !== id) return e;

        // אם שינינו עמודה, נאפס את הערך כי הוא כנראה לא רלוונטי לעמודה החדשה
        if (field === "columnName") {
          return { ...e, columnName: newValue, value: "" };
        }

        return { ...e, [field]: newValue };
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // המרה לפורמט שהשרת מצפה לו
      const formattedEventChain = eventChain.map((event) => ({
        eventName: event.eventName,
        columnId: event.columnName,
        value: event.value,
      }));

      const result = await createAutomationRule({
        name,
        triggerType: "MULTI_EVENT_DURATION",
        triggerConfig: {
          tableId,
          eventChain: formattedEventChain,
        },
        actionType: "CALCULATE_MULTI_EVENT_DURATION",
        actionConfig: {},
        createdBy: currentUserId,
      });

      if (result.success) {
        onCreated();
        onClose();
      } else {
        alert("שגיאה ביצירת האוטומציה");
      }
    } catch (error) {
      console.error(error);
      alert("שגיאה ביצירת האוטומציה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              🔥 חישוב ביצועים - אירועים מרובים
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              מדוד זמנים בין סדרת אירועים (לדוגמה: ליד נוצר → בטיפול → לקוח
              משלם)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* שם האוטומציה */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              שם האוטומציה
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="לדוגמה: זמן המרה מליד ללקוח"
            />
          </div>

          {/* בחירת טבלה */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              באיזו טבלה?
            </label>
            <select
              required
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white"
            >
              <option value="">בחר טבלה...</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </select>
          </div>

          {/* שרשרת אירועים */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block text-sm font-bold text-gray-700">
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
                // מציאת העמודה שנבחרה עבור האירוע הנוכחי
                const selectedColumn = columns.find(
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

                return (
                  <div
                    key={event.id}
                    className="bg-gray-50 p-5 rounded-xl border border-gray-200 shadow-sm relative transition hover:border-blue-300"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          index === 0
                            ? "bg-green-500"
                            : index === eventChain.length - 1
                            ? "bg-red-500"
                            : "bg-yellow-500"
                        }`}
                      ></div>
                      <h4 className="text-sm font-semibold text-gray-900">
                        {index === 0
                          ? "אירוע התחלה"
                          : index === eventChain.length - 1
                          ? "אירוע סיום"
                          : `שלב ביניים ${index}`}
                      </h4>

                      {eventChain.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeEvent(event.id)}
                          className="absolute top-4 left-4 text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="מחק שלב"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* שם האירוע */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                          שם האירוע לתצוגה
                        </label>
                        <input
                          type="text"
                          required
                          value={event.eventName}
                          onChange={(e) =>
                            updateEvent(event.id, "eventName", e.target.value)
                          }
                          placeholder='לדוגמה: "ליד חדש"'
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        />
                      </div>

                      {/* שם העמודה - Dropdown חכם */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                          עמודה מנטרת
                        </label>
                        {loadingColumns ? (
                          <div className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-400 animate-pulse">
                            טוען עמודות...
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
                            disabled={!tableId}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            <option value="">בחר עמודה...</option>
                            {columns.map((col) => (
                              <option key={col.name} value={col.name}>
                                {col.label || col.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* הערך - דינמי לפי סוג העמודה */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                          ערך טריגר
                        </label>

                        {isBoolean ? (
                          <select
                            required
                            value={event.value}
                            onChange={(e) =>
                              updateEvent(event.id, "value", e.target.value)
                            }
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition"
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
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition"
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
                                : "הזן ערך..."
                            }
                            disabled={!event.columnName}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition disabled:bg-gray-100"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
              💡
              <span>
                הגדר את השרשרת לפי סדר כרונולוגי. המערכת תחשב אוטומטית את הזמן
                בין כל שני שלבים עוקבים.
              </span>
            </p>
          </div>

          {/* כפתורים */}
          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition shadow-sm"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition shadow-md hover:shadow-lg"
            >
              {loading ? "שומר..." : "צור אוטומציה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
