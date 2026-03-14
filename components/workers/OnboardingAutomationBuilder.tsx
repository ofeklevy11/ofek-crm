"use client";

import { useState, useEffect } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import {
  X,
  Zap,
  CheckSquare,
  Settings2,
  Table,
  DollarSign,
  Bell,
  Globe,
  MessageCircle,
  Calendar,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Info,
  CreditCard,
  User,
  Phone,
  Layout,
  FileText,
  Clock,
  Plus,
} from "lucide-react";
import { getTableById } from "@/app/actions/tables";
import { getAllFiles } from "@/app/actions/storage";
import { toast } from "sonner";
import { showAlert } from "@/hooks/use-modal";

export interface OnCompleteAction {
  actionType:
    | "UPDATE_RECORD"
    | "CREATE_RECORD"
    | "CREATE_TASK"
    | "UPDATE_TASK"
    | "CREATE_FINANCE"
    | "SEND_NOTIFICATION"
    | "SEND_WEBHOOK"
    | "SEND_WHATSAPP"
    | "SEND_SMS"
    | "CREATE_CALENDAR_EVENT";
  config: Record<string, unknown>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (action: OnCompleteAction) => void;
  initialAction?: OnCompleteAction | null;
  users: Array<{ id: number; name: string }>;
  tables: Array<{ id: number; name: string }>;
}

const actionTypes = [
  {
    value: "CREATE_TASK",
    label: "יצירת משימה",
    description: "צור משימה חדשה באופן אוטומטי",
    icon: CheckSquare,
    color: "bg-emerald-100 text-emerald-600",
  },
  {
    value: "SEND_NOTIFICATION",
    label: "שליחת התראה",
    description: "שלח התראה למשתמש במערכת",
    icon: Bell,
    color: "bg-orange-100 text-orange-600",
  },
  {
    value: "SEND_WHATSAPP",
    label: "שליחת וואטספ",
    description: "שלח הודעת וואטספ אוטומטית",
    icon: MessageCircle,
    color: "bg-green-100 text-green-600",
  },
  {
    value: "SEND_SMS",
    label: "שליחת SMS",
    description: "שלח הודעת SMS אוטומטית",
    icon: Phone,
    color: "bg-blue-100 text-blue-600",
  },
  {
    value: "CREATE_CALENDAR_EVENT",
    label: "יצירת אירוע",
    description: "קבע אירוע חדש ביומן",
    icon: Calendar,
    color: "bg-pink-100 text-pink-600",
  },
  {
    value: "CREATE_FINANCE",
    label: "רשומה פיננסית",
    description: "צור הכנסה או הוצאה חדשה",
    icon: DollarSign,
    color: "bg-yellow-100 text-yellow-600",
  },
  {
    value: "SEND_WEBHOOK",
    description: "שדר נתונים למערכת חיצונית",
    icon: Globe,
    color: "bg-cyan-100 text-cyan-600",
  },
  {
    value: "CREATE_RECORD",
    label: "יצירת רשומה",
    description: "צור רשומה חדשה בטבלה באופן אוטומטי",
    icon: Table,
    color: "bg-purple-100 text-purple-600",
  },
];

export default function OnboardingAutomationBuilder({
  isOpen,
  onClose,
  onSave,
  initialAction,
  users,
  tables,
}: Props) {
  const dialogRef = useFocusTrap(onClose);
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<string>(
    initialAction?.actionType || "",
  );
  const [config, setConfig] = useState<Record<string, unknown>>(
    initialAction?.config || {},
  );
  const [columns, setColumns] = useState<any[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<any[]>([]);
  const [waPhoneColumns, setWaPhoneColumns] = useState<any[]>([]);
  const [loadingWaColumns, setLoadingWaColumns] = useState(false);

  // Reset state when modal opens/closes or initialAction changes
  useEffect(() => {
    if (isOpen) {
      if (initialAction) {
        setStep(2);
        setSelectedType(initialAction.actionType);
        setConfig(initialAction.config);
      } else {
        setStep(1);
        setSelectedType("");
        setConfig({});
      }
    }
  }, [isOpen, initialAction]);

  // Load columns for table based actions
  useEffect(() => {
    const tableId = config.tableId as number | undefined;
    if (
      (selectedType === "UPDATE_RECORD" || selectedType === "CREATE_RECORD") &&
      tableId
    ) {
      setLoadingColumns(true);
      getTableById(Number(tableId))
        .then((res) => {
          if (res.success && res.data && res.data.schemaJson) {
            const schema = res.data.schemaJson as any;
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
    }
  }, [selectedType, config.tableId]);

  // Load files for WhatsApp media
  useEffect(() => {
    if ((selectedType === "SEND_WHATSAPP" || selectedType === "SEND_SMS") && config.messageType === "media") {
      getAllFiles().then(setAvailableFiles);
    }
  }, [selectedType, config.messageType]);

  // Load columns for WhatsApp table selection
  useEffect(() => {
    const waTableId = config.waTableId as number | undefined;
    if ((selectedType === "SEND_WHATSAPP" || selectedType === "SEND_SMS") && waTableId) {
      setLoadingWaColumns(true);
      getTableById(Number(waTableId))
        .then((res) => {
          if (res.success && res.data && res.data.schemaJson) {
            const schema = res.data.schemaJson as any;
            let cols: any[] = [];
            if (Array.isArray(schema)) {
              cols = schema;
            } else if (schema && Array.isArray(schema.columns)) {
              cols = schema.columns;
            }
            // Filter to only show phone-like columns
            const phoneCols = cols.filter(
              (c) =>
                c.type === "phone" ||
                c.type === "text" ||
                c.name?.toLowerCase().includes("phone") ||
                c.name?.toLowerCase().includes("טלפון") ||
                c.label?.toLowerCase().includes("phone") ||
                c.label?.includes("טלפון"),
            );
            setWaPhoneColumns(phoneCols.length > 0 ? phoneCols : cols);
          }
        })
        .finally(() => setLoadingWaColumns(false));
    } else {
      setWaPhoneColumns([]);
    }
  }, [selectedType, config.waTableId]);

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
    setStep(2);
    // Initialize default config based on type if needed
    if (type === "CREATE_TASK") {
      setConfig((prev) => ({ ...prev, status: "todo", priority: "medium" }));
    }
  };

  const updateConfig = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    // Validate
    if (!validateConfig()) return;

    onSave({
      actionType: selectedType as OnCompleteAction["actionType"],
      config,
    });
    toast.success("האוטומציה נשמרה בהצלחה");
    onClose();
  };

  const validateConfig = () => {
    if (!selectedType) return false;

    switch (selectedType) {
      case "SEND_NOTIFICATION":
        if (!config.recipientId || !config.title) {
          showAlert("אנא מלא את כל שדות החובה");
          return false;
        }
        break;
      case "CREATE_TASK":
        if (!config.title) {
          showAlert("יש להזין כותרת למשימה");
          return false;
        }
        break;
      case "SEND_WHATSAPP":
      case "SEND_SMS":
        // Check if phone source is from table or manual
        if (config.phoneSource === "table") {
          // When using table as phone source, validate table and column selection
          if (!config.waTableId || !config.waPhoneColumn) {
            showAlert("יש לבחור טבלה ושדה טלפון");
            return false;
          }
        } else {
          // Manual phone entry
          if (!config.phone) {
            showAlert("יש למלא מספר טלפון");
            return false;
          }
        }
        // Message is always required
        if (!config.message) {
          showAlert("יש למלא תוכן הודעה");
          return false;
        }
        break;
      case "CREATE_RECORD":
        if (!config.tableId) {
          showAlert("יש לבחור טבלה");
          return false;
        }
        break;
      // Add other validations as needed
    }
    return true;
  };

  // Helper to safely get updates object for UPDATE_RECORD
  const getSafeUpdates = (): Record<string, unknown> => {
    const updates = config.updates;
    if (typeof updates === "object" && updates !== null) {
      return updates as Record<string, unknown>;
    }
    return {};
  };

  // Helper to get available columns for UPDATE_RECORD
  const getAvailableColumns = (currentKey: string) => {
    const currentUpdates = getSafeUpdates();
    const usedKeys = Object.keys(currentUpdates);
    return columns.filter(
      (col) => !usedKeys.includes(col.name) || col.name === currentKey,
    );
  };

  const handleAddUpdateField = () => {
    const currentUpdates = getSafeUpdates();
    // Find first available column
    const usedKeys = Object.keys(currentUpdates);
    const availableCol = columns.find((c) => !usedKeys.includes(c.name));

    if (availableCol) {
      updateConfig("updates", {
        ...currentUpdates,
        [availableCol.name]: "",
      });
    } else {
      showAlert("אין עוד שדות זמינים לעדכון בטבלה זו");
    }
  };

  const handleRemoveUpdateField = (key: string) => {
    const currentUpdates = { ...getSafeUpdates() };
    delete currentUpdates[key];
    updateConfig("updates", currentUpdates);
  };

  const handleUpdateFieldKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const currentUpdates = { ...getSafeUpdates() };
    const value = currentUpdates[oldKey];
    delete currentUpdates[oldKey];
    currentUpdates[newKey] = value;
    updateConfig("updates", currentUpdates);
  };

  const handleUpdateFieldValue = (key: string, value: any) => {
    const currentUpdates = { ...getSafeUpdates() };
    currentUpdates[key] = value;
    updateConfig("updates", currentUpdates);
  };

  // Helper to safely get values object for CREATE_RECORD
  const getSafeValues = (): Record<string, unknown> => {
    const values = config.values;
    if (typeof values === "object" && values !== null) {
      return values as Record<string, unknown>;
    }
    return {};
  };

  // Helper to get available columns for CREATE_RECORD
  const getAvailableValueColumns = (currentKey: string) => {
    const currentValues = getSafeValues();
    const usedKeys = Object.keys(currentValues);
    return columns.filter(
      (col) => !usedKeys.includes(col.name) || col.name === currentKey,
    );
  };

  const handleAddValueField = () => {
    const currentValues = getSafeValues();
    // Find first available column
    const usedKeys = Object.keys(currentValues);
    const availableCol = columns.find((c) => !usedKeys.includes(c.name));

    if (availableCol) {
      updateConfig("values", {
        ...currentValues,
        [availableCol.name]: "",
      });
    } else {
      showAlert("אין עוד שדות זמינים למילוי בטבלה זו");
    }
  };

  const handleRemoveValueField = (key: string) => {
    const currentValues = { ...getSafeValues() };
    delete currentValues[key];
    updateConfig("values", currentValues);
  };

  const handleValueFieldKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const currentValues = { ...getSafeValues() };
    const value = currentValues[oldKey];
    delete currentValues[oldKey];
    currentValues[newKey] = value;
    updateConfig("values", currentValues);
  };

  const handleValueFieldValue = (key: string, value: any) => {
    const currentValues = { ...getSafeValues() };
    currentValues[key] = value;
    updateConfig("values", currentValues);
  };

  const renderStep1 = () => (
    <div className="p-1">
      <h3 className="text-xl font-bold text-gray-900 mb-2">בחר סוג פעולה</h3>
      <p className="text-gray-500 mb-6">מה תרצה שיקרה כשהשלב יושלם?</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2">
        {actionTypes.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.value}
              onClick={() => handleTypeSelect(type.value)}
              className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition text-right group"
            >
              <div
                className={`p-3 rounded-lg ${type.color} group-hover:scale-110 transition-transform`}
              >
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
                  {type.label}
                </h4>
                <p className="text-sm text-gray-500 mt-1">{type.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderConfigForm = () => {
    switch (selectedType) {
      case "CREATE_TASK":
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="auto-task-title" className="block text-sm font-medium text-gray-700 mb-1">
                כותרת המשימה *
              </label>
              <input
                id="auto-task-title"
                type="text"
                value={(config.title as string) || ""}
                onChange={(e) => updateConfig("title", e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="לדוגמה: להכין דו״ח חודשי"
              />
            </div>
            <div>
              <label htmlFor="auto-task-description" className="block text-sm font-medium text-gray-700 mb-1">
                תיאור
              </label>
              <textarea
                id="auto-task-description"
                value={(config.description as string) || ""}
                onChange={(e) => updateConfig("description", e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="auto-task-status" className="block text-sm font-medium text-gray-700 mb-1">
                  סטטוס
                </label>
                <select
                  id="auto-task-status"
                  value={(config.status as string) || "todo"}
                  onChange={(e) => updateConfig("status", e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todo">משימות</option>
                  <option value="in_progress">משימות בטיפול</option>
                  <option value="waiting_client">ממתינים לאישור לקוח</option>
                  <option value="on_hold">משימות בהשהייה</option>
                  <option value="completed_month">בוצעו החודש</option>
                  <option value="done">משימות שבוצעו</option>
                </select>
              </div>
              <div>
                <label htmlFor="auto-task-priority" className="block text-sm font-medium text-gray-700 mb-1">
                  עדיפות
                </label>
                <select
                  id="auto-task-priority"
                  value={(config.priority as string) || "medium"}
                  onChange={(e) => updateConfig("priority", e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="low">נמוכה</option>
                  <option value="medium">רגילה</option>
                  <option value="high">גבוהה</option>
                </select>
              </div>
              <div>
                <label htmlFor="auto-task-assignee" className="block text-sm font-medium text-gray-700 mb-1">
                  הקצאה ל-
                </label>
                <select
                  id="auto-task-assignee"
                  value={(config.assigneeId as number) || ""}
                  onChange={(e) =>
                    updateConfig("assigneeId", Number(e.target.value))
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">ללא הקצאה</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );

      case "SEND_NOTIFICATION":
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="auto-notif-recipient" className="block text-sm font-medium text-gray-700 mb-1">
                נמען *
              </label>
              <select
                id="auto-notif-recipient"
                value={(config.recipientId as number) || ""}
                onChange={(e) =>
                  updateConfig("recipientId", Number(e.target.value))
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">בחר נמען...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="auto-notif-title" className="block text-sm font-medium text-gray-700 mb-1">
                כותרת *
              </label>
              <input
                id="auto-notif-title"
                type="text"
                value={(config.title as string) || ""}
                onChange={(e) => updateConfig("title", e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="כותרת ההתראה"
              />
            </div>
            <div>
              <label htmlFor="auto-notif-message" className="block text-sm font-medium text-gray-700 mb-1">
                תוכן ההודעה
              </label>
              <textarea
                id="auto-notif-message"
                value={(config.message as string) || ""}
                onChange={(e) => updateConfig("message", e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                rows={3}
                placeholder="ניתן להשתמש ב-{userName}, {pathName}..."
              />
            </div>
          </div>
        );

      case "SEND_WHATSAPP":
      case "SEND_SMS":
        return (
          <div className="space-y-4">
            {/* Phone Source Selection */}
            <div>
              <label id="auto-phone-source-label" className="block text-sm font-medium text-gray-700 mb-2">
                מקור מספר הטלפון
              </label>
              <div className="flex gap-3" role="radiogroup" aria-labelledby="auto-phone-source-label">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="phoneSource"
                    checked={(config.phoneSource as string) !== "table"}
                    onChange={() => {
                      updateConfig("phoneSource", "manual");
                      updateConfig("waTableId", null);
                      updateConfig("waPhoneColumn", null);
                    }}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">הזנה ידנית</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="phoneSource"
                    checked={(config.phoneSource as string) === "table"}
                    onChange={() => {
                      updateConfig("phoneSource", "table");
                      updateConfig("phone", null);
                    }}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">מטבלה ב-CRM</span>
                </label>
              </div>
            </div>

            {/* Manual Phone Entry */}
            {(config.phoneSource as string) !== "table" && (
              <div>
                <label htmlFor="auto-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  מספר טלפון *
                </label>
                <input
                  id="auto-phone"
                  type="text"
                  value={(config.phone as string) || ""}
                  onChange={(e) => updateConfig("phone", e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="050... או ID קבוצה"
                  dir="ltr"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ניתן להזין מספר רגיל או מזהה קבוצה (Group ID)
                </p>
                {/* Preview Logic - only for Green API (WhatsApp) */}
                {selectedType === "SEND_WHATSAPP" && (config.phone as string) && (
                  <div className="mt-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-semibold">
                      תצוגה מקדימה למערכת (Preview)
                    </div>
                    <div className="text-xs font-mono text-green-600 dir-ltr font-medium">
                      {(() => {
                        const input = (config.phone as string) || "";
                        let clean = input.trim();
                        if (clean.endsWith("@g.us")) return clean;
                        clean = clean.replace(/\D/g, "");
                        if (clean.startsWith("0"))
                          clean = "972" + clean.substring(1);
                        if (clean && !clean.endsWith("@c.us")) clean += "@c.us";
                        return clean || "מספר לא תקין";
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Table-based Phone Selection */}
            {(config.phoneSource as string) === "table" && (
              <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <label htmlFor="auto-wa-table" className="block text-sm font-medium text-gray-700 mb-1">
                    בחר טבלה
                  </label>
                  <select
                    id="auto-wa-table"
                    value={(config.waTableId as number) || ""}
                    onChange={(e) => {
                      updateConfig("waTableId", Number(e.target.value));
                      updateConfig("waPhoneColumn", null);
                    }}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">בחר טבלה...</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {Boolean(config.waTableId) && (
                  <div>
                    <label htmlFor="auto-wa-phone-col" className="block text-sm font-medium text-gray-700 mb-1">
                      שדה טלפון
                    </label>
                    {loadingWaColumns ? (
                      <div className="text-sm text-gray-500">טוען שדות...</div>
                    ) : (
                      <select
                        id="auto-wa-phone-col"
                        value={(config.waPhoneColumn as string) || ""}
                        onChange={(e) =>
                          updateConfig("waPhoneColumn", e.target.value)
                        }
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                      >
                        <option value="">בחר שדה...</option>
                        {waPhoneColumns.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.label || col.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      הטלפון ייקח מהרשומה האחרונה או רשומה ספציפית
                    </p>
                  </div>
                )}

                {Boolean(config.waTableId) && Boolean(config.waPhoneColumn) && (
                  <div>
                    <label htmlFor="auto-wa-record-id" className="block text-sm font-medium text-gray-700 mb-1">
                      מזהה רשומה (אופציונלי)
                    </label>
                    <input
                      id="auto-wa-record-id"
                      type="text"
                      value={(config.waRecordId as string) || ""}
                      onChange={(e) =>
                        updateConfig("waRecordId", e.target.value)
                      }
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                      placeholder="השאר ריק לרשומה האחרונה"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <label htmlFor="auto-msg-content" className="block text-sm font-medium text-gray-700 mb-1">
                תוכן ההודעה *
              </label>
              <textarea
                id="auto-msg-content"
                value={(config.message as string) || ""}
                onChange={(e) => updateConfig("message", e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                rows={4}
                placeholder="שלום {userName},..."
              />
              <p className="text-[10px] text-gray-500 mt-1.5">
                ניתן להשתמש ב-{"{workerName}"}, {"{stepTitle}"}, {"{pathName}"}
              </p>
            </div>
          </div>
        );

        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="auto-webhook-url" className="block text-sm font-medium text-gray-700 mb-1">
                URL *
              </label>
              <input
                id="auto-webhook-url"
                type="url"
                value={(config.url as string) || ""}
                onChange={(e) => updateConfig("url", e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="https://..."
                dir="ltr"
              />
            </div>
          </div>
        );

      case "CREATE_RECORD":
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="auto-create-record-table" className="block text-sm font-medium text-gray-700 mb-1">
                טבלה *
              </label>
              <select
                id="auto-create-record-table"
                value={(config.tableId as number) || ""}
                onChange={(e) =>
                  updateConfig("tableId", Number(e.target.value))
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">בחר טבלה...</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {Boolean(config.tableId) && (
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 block">
                    ערכי ברירת מחדל
                  </label>
                  <button
                    type="button"
                    onClick={handleAddValueField}
                    className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף שדה
                  </button>
                </div>

                {loadingColumns ? (
                  <div className="text-center py-4 text-sm text-gray-500">
                    טוען שדות...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(getSafeValues()).length === 0 && (
                      <p className="text-gray-400 text-sm italic">
                        לא נבחרו שדות למילוי
                      </p>
                    )}
                    {Object.entries(getSafeValues()).map(
                      ([key, value], idx) => {
                        const colDef = columns.find((c) => c.name === key);
                        const availableCols = getAvailableValueColumns(key);

                        return (
                          <div
                            key={idx}
                            className="flex items-start gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200"
                          >
                            <div className="flex-1 space-y-3">
                              {/* Column Selector */}
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">
                                  שדה
                                </label>
                                <select
                                  value={key}
                                  onChange={(e) =>
                                    handleValueFieldKey(key, e.target.value)
                                  }
                                  className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500"
                                >
                                  {colDef ? (
                                    <option value={key}>
                                      {colDef.label || key}
                                    </option>
                                  ) : (
                                    <option value={key}>{key}</option>
                                  )}
                                  {availableCols.map((col) => (
                                    <option
                                      key={col.id || col.name}
                                      value={col.name}
                                    >
                                      {col.label || col.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Value Input */}
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">
                                  ערך
                                </label>
                                {colDef?.type === "select" ||
                                colDef?.type === "status" ||
                                colDef?.type === "multiSelect" ? (
                                  <select
                                    value={value as string}
                                    onChange={(e) =>
                                      handleValueFieldValue(key, e.target.value)
                                    }
                                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                                  >
                                    <option value="">בחר ערך...</option>
                                    {colDef.options?.map(
                                      (opt: any, i: number) => (
                                        <option
                                          key={i}
                                          value={
                                            typeof opt === "string"
                                              ? opt
                                              : opt.value || opt.label
                                          }
                                        >
                                          {typeof opt === "string"
                                            ? opt
                                            : opt.label || opt.value}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                ) : colDef?.type === "boolean" ||
                                  colDef?.type === "checkbox" ? (
                                  <select
                                    value={String(value)}
                                    onChange={(e) =>
                                      handleValueFieldValue(
                                        key,
                                        e.target.value === "true",
                                      )
                                    }
                                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                                  >
                                    <option value="false">לא / כבוי</option>
                                    <option value="true">כן / פעיל</option>
                                  </select>
                                ) : (
                                  <input
                                    type={
                                      colDef?.type === "number" ||
                                      colDef?.type === "currency"
                                        ? "number"
                                        : "text"
                                    }
                                    value={value as string}
                                    onChange={(e) =>
                                      handleValueFieldValue(
                                        key,
                                        colDef?.type === "number" ||
                                          colDef?.type === "currency"
                                          ? parseFloat(e.target.value)
                                          : e.target.value,
                                      )
                                    }
                                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                                    placeholder={`הזן ערך ל${colDef?.label || key}`}
                                  />
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveValueField(key)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-6"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case "UPDATE_RECORD":
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="auto-update-record-table" className="block text-sm font-medium text-gray-700 mb-1">
                טבלה *
              </label>
              <select
                id="auto-update-record-table"
                value={(config.tableId as number) || ""}
                onChange={(e) =>
                  updateConfig("tableId", Number(e.target.value))
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">בחר טבלה...</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="auto-update-record-id" className="block text-sm font-medium text-gray-700 mb-1">
                מזהה רשומה (ID)
              </label>
              <input
                id="auto-update-record-id"
                type="text"
                value={(config.recordId as string) || ""}
                onChange={(e) => updateConfig("recordId", e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="ID של הרשומה לעדכון"
              />
            </div>

            {Boolean(config.tableId) && (
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 block">
                    שדות לעדכון
                  </label>
                  <button
                    type="button"
                    onClick={handleAddUpdateField}
                    className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף שדה
                  </button>
                </div>

                {loadingColumns ? (
                  <div className="text-center py-4 text-sm text-gray-500">
                    טוען שדות...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(getSafeUpdates()).length === 0 && (
                      <p className="text-gray-400 text-sm italic">
                        לא נבחרו שדות לעדכון
                      </p>
                    )}
                    {Object.entries(getSafeUpdates()).map(
                      ([key, value], idx) => {
                        const colDef = columns.find((c) => c.name === key);
                        const availableCols = getAvailableColumns(key);

                        return (
                          <div
                            key={idx}
                            className="flex items-start gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200"
                          >
                            <div className="flex-1 space-y-3">
                              {/* Column Selector */}
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">
                                  שדה
                                </label>
                                <select
                                  value={key}
                                  onChange={(e) =>
                                    handleUpdateFieldKey(key, e.target.value)
                                  }
                                  className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500"
                                >
                                  {colDef ? (
                                    <option value={key}>
                                      {colDef.label || key}
                                    </option>
                                  ) : (
                                    <option value={key}>{key}</option>
                                  )}
                                  {availableCols.map((col) => (
                                    <option
                                      key={col.id || col.name}
                                      value={col.name}
                                    >
                                      {col.label || col.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Value Input */}
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">
                                  ערך חדש
                                </label>
                                {colDef?.type === "select" ||
                                colDef?.type === "status" ||
                                colDef?.type === "multiSelect" ? (
                                  <select
                                    value={value as string}
                                    onChange={(e) =>
                                      handleUpdateFieldValue(
                                        key,
                                        e.target.value,
                                      )
                                    }
                                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                                  >
                                    <option value="">בחר ערך...</option>
                                    {colDef.options?.map(
                                      (opt: any, i: number) => (
                                        <option
                                          key={i}
                                          value={
                                            typeof opt === "string"
                                              ? opt
                                              : opt.value || opt.label
                                          }
                                        >
                                          {typeof opt === "string"
                                            ? opt
                                            : opt.label || opt.value}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                ) : colDef?.type === "boolean" ||
                                  colDef?.type === "checkbox" ? (
                                  <select
                                    value={String(value)}
                                    onChange={(e) =>
                                      handleUpdateFieldValue(
                                        key,
                                        e.target.value === "true",
                                      )
                                    }
                                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                                  >
                                    <option value="false">לא / כבוי</option>
                                    <option value="true">כן / פעיל</option>
                                  </select>
                                ) : (
                                  <input
                                    type={
                                      colDef?.type === "number" ||
                                      colDef?.type === "currency"
                                        ? "number"
                                        : "text"
                                    }
                                    value={value as string}
                                    onChange={(e) =>
                                      handleUpdateFieldValue(
                                        key,
                                        colDef?.type === "number" ||
                                          colDef?.type === "currency"
                                          ? parseFloat(e.target.value)
                                          : e.target.value,
                                      )
                                    }
                                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                                    placeholder={`הזן ערך ל${colDef?.label || key}`}
                                  />
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveUpdateField(key)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-6"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case "CREATE_FINANCE":
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="auto-finance-title" className="block text-sm font-medium text-gray-700 mb-1">
                כותרת *
              </label>
              <input
                id="auto-finance-title"
                type="text"
                value={(config.title as string) || ""}
                onChange={(e) => updateConfig("title", e.target.value)}
                placeholder="שם הרשומה"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="auto-finance-amount" className="block text-sm font-medium text-gray-700 mb-1">
                  סכום *
                </label>
                <input
                  id="auto-finance-amount"
                  type="number"
                  value={(config.amount as number) || ""}
                  onChange={(e) =>
                    updateConfig("amount", parseFloat(e.target.value))
                  }
                  placeholder="0.00"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="auto-finance-type" className="block text-sm font-medium text-gray-700 mb-1">
                  סוג *
                </label>
                <select
                  id="auto-finance-type"
                  value={(config.type as string) || "INCOME"}
                  onChange={(e) => updateConfig("type", e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="INCOME">הכנסה</option>
                  <option value="EXPENSE">הוצאה</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="auto-finance-category" className="block text-sm font-medium text-gray-700 mb-1">
                קטגוריה
              </label>
              <input
                id="auto-finance-category"
                type="text"
                value={(config.category as string) || ""}
                onChange={(e) => updateConfig("category", e.target.value)}
                placeholder='לדוגמה: "מכירות"'
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        );

      case "UPDATE_TASK":
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="auto-update-task-id" className="block text-sm font-medium text-gray-700 mb-1">
                מזהה המשימה (Task ID)
              </label>
              <input
                id="auto-update-task-id"
                type="text"
                value={(config.taskId as string) || ""}
                onChange={(e) => updateConfig("taskId", e.target.value)}
                placeholder="ID של המשימה לעדכון"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="auto-update-task-status" className="block text-sm font-medium text-gray-700 mb-1">
                סטטוס חדש
              </label>
              <select
                id="auto-update-task-status"
                value={(getSafeUpdates().status as string) || ""}
                onChange={(e) =>
                  updateConfig("updates", {
                    ...getSafeUpdates(),
                    status: e.target.value || undefined,
                  })
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">ללא שינוי</option>
                <option value="todo">משימות</option>
                <option value="in_progress">משימות בטיפול</option>
                <option value="waiting_client">ממתינים לאישור לקוח</option>
                <option value="on_hold">משימות בהשהייה</option>
                <option value="completed_month">בוצעו החודש</option>
                <option value="done">משימות שבוצעו</option>
              </select>
            </div>
          </div>
        );

      case "CREATE_CALENDAR_EVENT":
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="auto-event-title" className="block text-sm font-medium text-gray-700 mb-1">
                כותרת האירוע *
              </label>
              <input
                id="auto-event-title"
                type="text"
                value={(config.title as string) || ""}
                onChange={(e) => updateConfig("title", e.target.value)}
                placeholder="פגישת היכרות"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="auto-event-start" className="block text-sm font-medium text-gray-700 mb-1">
                  התחלה (שעה/תאריך) *
                </label>
                <input
                  id="auto-event-start"
                  type="datetime-local"
                  value={(config.startTime as string) || ""}
                  onChange={(e) => updateConfig("startTime", e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="auto-event-end" className="block text-sm font-medium text-gray-700 mb-1">
                  סיום (שעה/תאריך) *
                </label>
                <input
                  id="auto-event-end"
                  type="datetime-local"
                  value={(config.endTime as string) || ""}
                  onChange={(e) => updateConfig("endTime", e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="auto-event-description" className="block text-sm font-medium text-gray-700 mb-1">
                תיאור
              </label>
              <textarea
                id="auto-event-description"
                value={(config.description as string) || ""}
                onChange={(e) => updateConfig("description", e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                rows={2}
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="text-center py-10 text-gray-500">
            <p>אנא בחר סוג פעולה</p>
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="automation-builder-title">
      <div ref={dialogRef} className="bg-white/95 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-white/50 backdrop-blur border-b p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="p-1 hover:bg-gray-100 rounded-full transition"
                aria-label="חזור לבחירת פעולה"
              >
                <ArrowRight className="w-5 h-5 text-gray-500" />
              </button>
            )}
            <div>
              <h2 id="automation-builder-title" className="text-lg font-bold text-gray-900">
                {step === 1 ? "הוספת אוטומציה חדשה" : "הגדרת פעולה"}
              </h2>
              <p className="text-sm text-gray-500">
                {step === 1
                  ? "בחר את הפעולה שתרצה לבצע"
                  : actionTypes.find((t) => t.value === selectedType)?.label}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {step === 1 ? (
            renderStep1()
          ) : (
            <div className="animate-in slide-in-from-left-4 duration-300">
              {renderConfigForm()}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 2 && (
          <div className="p-4 border-t bg-gray-50 flex items-center justify-end gap-3 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition"
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all transform hover:-translate-y-0.5"
            >
              שמור אוטומציה
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
