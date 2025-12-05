"use client";

import { useState, useEffect } from "react";
import {
  createAutomationRule,
  updateAutomationRule,
} from "@/app/actions/automations";
import { getTableById } from "@/app/actions/tables";
import { X, Loader2 } from "lucide-react";

interface User {
  id: number;
  name: string;
}

interface AutomationModalProps {
  users: User[];
  tables: { id: number; name: string }[];
  currentUserId: number;
  onClose: () => void;
  onCreated: () => void;
  editingRule?: {
    id: number;
    name: string;
    triggerType: string;
    triggerConfig: any;
    actionType: string;
    actionConfig: any;
  } | null;
}

export default function AutomationModal({
  users,
  tables,
  currentUserId,
  onClose,
  onCreated,
  editingRule,
}: AutomationModalProps) {
  const [name, setName] = useState(editingRule?.name || "");
  const [triggerType, setTriggerType] = useState<
    "TASK_STATUS_CHANGE" | "NEW_RECORD" | "RECORD_FIELD_CHANGE"
  >((editingRule?.triggerType as any) || "RECORD_FIELD_CHANGE");

  // Task specific
  const [toStatus, setToStatus] = useState(
    editingRule?.triggerConfig?.toStatus || "any"
  );

  // Generic Record specific
  const [tableId, setTableId] = useState(
    editingRule?.triggerConfig?.tableId || ""
  );
  const [columnId, setColumnId] = useState(
    editingRule?.triggerConfig?.columnId || ""
  );
  const [fromValue, setFromValue] = useState(
    editingRule?.triggerConfig?.fromValue || ""
  );
  const [toValue, setToValue] = useState(
    editingRule?.triggerConfig?.toValue || ""
  );

  const [columns, setColumns] = useState<any[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  useEffect(() => {
    if (tableId && triggerType === "RECORD_FIELD_CHANGE") {
      setLoadingColumns(true);
      getTableById(Number(tableId))
        .then((res) => {
          if (res.success && res.data && res.data.schemaJson) {
            const schema = res.data.schemaJson as any;
            // Handle both schema structures: Array of columns directly or Object with columns property
            if (Array.isArray(schema)) {
              setColumns(schema);
            } else if (schema && Array.isArray(schema.columns)) {
              setColumns(schema.columns);
            } else {
              setColumns([]);
            }
          }
        })
        .finally(() => setLoadingColumns(false));
    } else {
      setColumns([]);
    }
  }, [tableId, triggerType]);

  const [recipientId, setRecipientId] = useState(
    editingRule?.actionConfig?.recipientId?.toString() || ""
  );
  const [messageTemplate, setMessageTemplate] = useState(
    editingRule?.actionConfig?.messageTemplate ||
      "המשימה {taskTitle} עברה לסטטוס {toStatus}"
  );
  const [loading, setLoading] = useState(false);

  const [actionType, setActionType] = useState<
    "SEND_NOTIFICATION" | "CALCULATE_DURATION"
  >((editingRule?.actionType as any) || "SEND_NOTIFICATION");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let triggerConfig: any = {};

      if (triggerType === "TASK_STATUS_CHANGE") {
        triggerConfig = { toStatus: toStatus === "any" ? undefined : toStatus };
      } else if (triggerType === "NEW_RECORD") {
        triggerConfig = { tableId };
      } else if (triggerType === "RECORD_FIELD_CHANGE") {
        triggerConfig = {
          tableId,
          columnId,
          fromValue: fromValue || undefined,
          toValue: toValue || undefined,
        };
      }

      const data = {
        name,
        triggerType,
        triggerConfig,
        actionType,
        actionConfig:
          actionType === "SEND_NOTIFICATION"
            ? {
                recipientId: parseInt(recipientId),
                messageTemplate,
                titleTemplate: "עדכון במערכת",
              }
            : {},
      };

      let result;
      if (editingRule) {
        result = await updateAutomationRule(editingRule.id, data);
      } else {
        result = await createAutomationRule({
          ...data,
          createdBy: currentUserId,
        });
      }

      if (result.success) {
        onCreated();
        onClose();
      } else {
        alert("Failed to save automation");
      }
    } catch (error) {
      console.error(error);
      alert("Error saving automation");
    } finally {
      setLoading(false);
    }
  };

  const selectedColumn = columns.find(
    (c) => c.id === columnId || c.name === columnId
  );
  const isSelectColumn =
    selectedColumn &&
    (selectedColumn.type === "select" || selectedColumn.type === "multiSelect");

  return (
    <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">
            {editingRule ? "ערוך אוטומציה" : "צור אוטומציה חדשה"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              שם האוטומציה
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="לדוגמה: התראה על שינוי סטטוס"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              טריגר (מה גורם להפעלה)
            </label>
            <select
              value={triggerType}
              onChange={(e) => {
                const type = e.target.value as any;
                setTriggerType(type);
                if (type === "NEW_RECORD") {
                  setMessageTemplate("נוצרה רשומה חדשה בטבלה {tableName}");
                } else if (type === "TASK_STATUS_CHANGE") {
                  setMessageTemplate(
                    "המשימה {taskTitle} עברה לסטטוס {toStatus}"
                  );
                } else if (type === "RECORD_FIELD_CHANGE") {
                  setMessageTemplate(
                    "שדה {fieldName} שונה מ-{fromValue} ל-{toValue}"
                  );
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="RECORD_FIELD_CHANGE">שינוי ערך בטבלה</option>
              <option value="NEW_RECORD">רשומה חדשה בטבלה</option>
            </select>
          </div>

          {triggerType === "TASK_STATUS_CHANGE" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                כאשר הסטטוס משתנה ל-
              </label>
              <select
                value={toStatus}
                onChange={(e) => setToStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="any">כל סטטוס</option>
                <option value="todo">לביצוע</option>
                <option value="in_progress">בטיפול</option>
                <option value="waiting_client">ממתין ללקוח</option>
                <option value="completed_month">בוצע</option>
              </select>
            </div>
          )}

          {(triggerType === "NEW_RECORD" ||
            triggerType === "RECORD_FIELD_CHANGE") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                באיזו טבלה?
              </label>
              <select
                required
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">בחר טבלה...</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {triggerType === "RECORD_FIELD_CHANGE" && tableId && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  בחר עמודה לניטור
                </label>
                {loadingColumns ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="animate-spin" size={16} /> בודק
                    עמודות...
                  </div>
                ) : (
                  <select
                    required
                    value={columnId}
                    onChange={(e) => {
                      setColumnId(e.target.value);
                      setFromValue("");
                      setToValue("");
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">בחר עמודה...</option>
                    {columns.map((col: any) => (
                      <option key={col.id || col.name} value={col.name}>
                        {col.label || col.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedColumn && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      מ- {actionType !== "CALCULATE_DURATION" && "(אופציונלי)"}
                    </label>
                    {isSelectColumn ? (
                      <select
                        required={actionType === "CALCULATE_DURATION"}
                        value={fromValue}
                        onChange={(e) => setFromValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">כל ערך</option>
                        {selectedColumn.options?.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required={actionType === "CALCULATE_DURATION"}
                        value={fromValue}
                        onChange={(e) => setFromValue(e.target.value)}
                        placeholder="כל ערך"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ל- {actionType !== "CALCULATE_DURATION" && "(אופציונלי)"}
                    </label>
                    {isSelectColumn ? (
                      <select
                        required={actionType === "CALCULATE_DURATION"}
                        value={toValue}
                        onChange={(e) => setToValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">כל ערך</option>
                        {selectedColumn.options?.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required={actionType === "CALCULATE_DURATION"}
                        value={toValue}
                        onChange={(e) => setToValue(e.target.value)}
                        placeholder="כל ערך"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">פעולה</h4>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                סוג הפעולה
              </label>
              <select
                value={actionType}
                onChange={(e) =>
                  setActionType(
                    e.target.value as "SEND_NOTIFICATION" | "CALCULATE_DURATION"
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="SEND_NOTIFICATION">שליחת התראה</option>
                <option value="CALCULATE_DURATION">חישוב זמן בסטטוס</option>
              </select>
            </div>

            {actionType === "SEND_NOTIFICATION" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    למי לשלוח?
                  </label>
                  <select
                    required
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">בחר משתמש...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    תוכן ההודעה
                  </label>
                  <textarea
                    required
                    value={messageTemplate}
                    onChange={(e) => setMessageTemplate(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    משתנים זמינים:{" "}
                    {triggerType === "TASK_STATUS_CHANGE"
                      ? "{taskTitle}, {fromStatus}, {toStatus}"
                      : triggerType === "RECORD_FIELD_CHANGE"
                      ? "{tableName}, {fieldName}, {fromValue}, {toValue}"
                      : "{tableName}"}
                  </p>
                </div>
              </>
            )}
            {actionType === "CALCULATE_DURATION" && (
              <p className="text-sm text-gray-600">
                פעולה זו תחשב את הזמן שבו הרשומה הייתה בסטטוס "
                {fromValue || "המקור"}" לפני המעבר לסטטוס "{toValue || "היעד"}".
                התוצאה תשמר בשדה בדאטהבייס.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading
                ? "שומר..."
                : editingRule
                ? "שמור שינויים"
                : "צור אוטומציה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
