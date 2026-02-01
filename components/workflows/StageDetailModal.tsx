"use client";

import { useState, useEffect } from "react";
import { WorkflowStage } from "@prisma/client";
import {
  X,
  Zap,
  Target,
  GitCommit,
  Info,
  Trash2,
  Save,
  Plus,
  Edit2,
  Mail,
  MessageSquare,
  CheckSquare,
  Bell,
  Edit3,
  Globe,
  ToggleRight,
  Equal,
  Clock,
  FileText,
  TrendingUp,
  ChevronRight,
  Lock,
  MessageCircle,
  AlertTriangle,
  Calendar,
  Database,
  ArrowLeft,
  Trash,
  Loader2,
  CheckCircle2,
  Copy,
  ChevronDown,
} from "lucide-react";
import { getAllFiles } from "@/app/actions/storage";
import { getTableById } from "@/app/actions/tables";
import { deleteStage, updateStage } from "@/app/actions/workflows";
import { useRouter } from "next/navigation";
import * as LucideIcons from "lucide-react";

interface StageDetailModalProps {
  stage: WorkflowStage | null;
  isOpen: boolean;
  onClose: () => void;
  isCreating?: boolean;
  onSave?: (data: any) => Promise<void>;
  onUpdate?: (stage: WorkflowStage) => void;
  onDelete?: (stageId: number) => void;
}

// ----------------------------------------------------------------------
// DATA TYPES & CONSTANTS
// ----------------------------------------------------------------------

const AVAILABLE_ICONS = [
  "Circle",
  "CheckCircle",
  "Clock",
  "AlertCircle",
  "FileText",
  "Send",
  "User",
  "GitBranch",
  "Briefcase",
  "DollarSign",
  "Headphones",
  "Settings",
];
const AVAILABLE_COLORS = ["blue", "green", "purple", "orange", "gray", "red"];

const CONDITION_TYPES = [
  {
    id: "status",
    label: "סטטוס שווה ל...",
    icon: ToggleRight,
    color: "bg-blue-50 text-blue-600",
  },
  {
    id: "field",
    label: "ערך שדה תואם",
    icon: Equal,
    color: "bg-green-50 text-green-600",
  },
  {
    id: "time",
    label: "עבר זמן מסוים (Time Delay)",
    icon: Clock,
    color: "bg-orange-50 text-orange-600",
  },
  {
    id: "form",
    label: "טופס מולא",
    icon: FileText,
    color: "bg-slate-100 text-slate-400",
    comingSoon: true,
  },
  {
    id: "score",
    label: "ניקוד מעל סף",
    icon: TrendingUp,
    color: "bg-slate-100 text-slate-400",
    comingSoon: true,
  },
];

const AUTOMATION_CATEGORIES = [
  {
    id: "tasks",
    label: "ניהול משימות",
    description: "יצירה, עדכון ומחיקה של משימות מערכת",
    icon: CheckSquare,
    color: "bg-indigo-100 text-indigo-600",
    actions: [
      {
        id: "create_task",
        label: "צור משימה חדשה",
        icon: Plus,
        description: "פותח משימה חדשה עבור נציג",
      },
    ],
  },
  {
    id: "records",
    label: "ניהול רשומות ודאטה",
    description: "פעולות CRUD על טבלאות המערכת",
    icon: Database,
    color: "bg-blue-100 text-blue-600",
    actions: [
      {
        id: "create_record",
        label: "צור רשומה חדשה",
        icon: Plus,
        description: "מוסיף שורה חדשה לטבלה",
      },
      {
        id: "update_record",
        label: "עדכן רשומה קיימת",
        icon: Edit3,
        description: "עורך ערכים ברשומה קיימת",
      },
    ],
  },
  {
    id: "calendar",
    label: "ניהול יומן",
    description: "קביעת פגישות ואירועים",
    icon: Calendar,
    color: "bg-pink-100 text-pink-600",
    actions: [
      {
        id: "create_event",
        label: "צור אירוע ביומן",
        icon: Plus,
        description: "משבץ פגישה או תזכורת",
      },
    ],
  },
  {
    id: "communication",
    label: "תקשורת והתראות",
    description: "אימייל, SMS, ווצאפ והתראות",
    icon: MessageSquare,
    color: "bg-green-100 text-green-600",
    actions: [
      {
        id: "notification",
        label: "שלח התראה פנימית",
        icon: Bell,
        description: "התראה למשתמש במערכת",
      },
      {
        id: "email",
        label: "שלח אימייל",
        icon: Mail,
        description: "שליחת מייל ללקוח",
        comingSoon: true,
      },
      {
        id: "whatsapp",
        label: "שלח WhatsApp",
        icon: MessageCircle,
        description: "שליחת הודעה לנייד",
      },
      {
        id: "sms",
        label: "שלח SMS",
        icon: MessageSquare,
        description: "שליחת מסרון",
        comingSoon: true,
      },
    ],
  },
  {
    id: "advanced",
    label: "מתקדם",
    description: "Webhooks ואינטגרציות",
    icon: Globe,
    color: "bg-purple-100 text-purple-600",
    actions: [
      {
        id: "webhook",
        label: "קריאת Webhook",
        icon: Globe,
        description: "שליחת נתונים למערכת חיצונית",
      },
    ],
  },
];

// ----------------------------------------------------------------------
// ACTION SELECTION MODAL (Hierarchical)
// ----------------------------------------------------------------------

function ActionSelectionModal({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: any) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) setSelectedCategory(null);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ margin: 0 }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory(null)}
                className="p-1 hover:bg-gray-200 rounded-full text-gray-500 mr-1"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h3 className="font-bold text-gray-900">
              {selectedCategory ? selectedCategory.label : "בחר סוג אוטומציה"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-full text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-2 max-h-[60vh] overflow-y-auto min-h-[300px]">
          {!selectedCategory ? (
            // RENDER CATEGORIES
            <div className="grid grid-cols-1 gap-2">
              {AUTOMATION_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat)}
                  className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-lg text-right transition-colors border border-transparent hover:border-gray-200 group"
                >
                  <div className={`p-3 rounded-xl ${cat.color} bg-opacity-20`}>
                    <cat.icon size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900 text-lg group-hover:text-indigo-700">
                      {cat.label}
                    </div>
                    <div className="text-sm text-gray-500">
                      {cat.description}
                    </div>
                  </div>
                  <ChevronRight
                    size={20}
                    className="text-gray-300 group-hover:text-indigo-400 rotate-180"
                  />
                </button>
              ))}
            </div>
          ) : (
            // RENDER SUB-ACTIONS
            <div className="grid grid-cols-1 gap-2">
              {selectedCategory.actions.map((action: any) => (
                <button
                  key={action.id}
                  disabled={action.comingSoon}
                  onClick={() => {
                    if (!action.comingSoon) {
                      onSelect(action);
                    }
                  }}
                  className={`flex items-center gap-4 p-3 rounded-lg text-right transition-colors border border-transparent group relative
                                ${
                                  action.comingSoon
                                    ? "opacity-60 cursor-not-allowed bg-gray-50"
                                    : "hover:bg-indigo-50 hover:border-indigo-100 cursor-pointer"
                                }
                            `}
                >
                  <div
                    className={`p-2 rounded-lg bg-gray-100 text-gray-600 group-hover:bg-white group-hover:text-indigo-600 group-hover:shadow-sm`}
                  >
                    <action.icon size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-gray-900 group-hover:text-indigo-700">
                        {action.label}
                      </div>
                      {action.comingSoon && (
                        <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                          בקרוב
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {action.description}
                    </div>
                  </div>
                  {action.comingSoon ? (
                    <Lock size={16} className="text-gray-300" />
                  ) : (
                    <ChevronRight
                      size={16}
                      className="text-gray-300 group-hover:text-indigo-400 rotate-180"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// CONFIGURATION MODAL
// ----------------------------------------------------------------------

function formatPhonePreview(phone: string, type: "private" | "group") {
  if (!phone) return "";
  let clean = phone.trim();
  if (type === "group") {
    if (!clean.endsWith("@g.us")) return clean + "@g.us";
    return clean;
  }
  // Private
  clean = clean.replace(/\D/g, "");
  if (clean.startsWith("0")) clean = "972" + clean.substring(1);
  if (!clean.endsWith("@c.us")) clean = clean + "@c.us";
  return clean;
}

function AutomationConfigModal({
  isOpen,
  onClose,
  onSave,
  type,
  users,
  tables,
  initialConfig,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { type: string; summary: string; config: any }) => void;
  type: any;
  users: any[];
  tables: any[];
  initialConfig?: any;
}) {
  const [fields, setFields] = useState<any>({});

  // Advanced WhatsApp State
  const [waTargetType, setWaTargetType] = useState<"private" | "group">(
    "private",
  );
  const [waMessageType, setWaMessageType] = useState<
    "private" | "group" | "media"
  >("private");
  const [waTableId, setWaTableId] = useState("");
  const [waColumns, setWaColumns] = useState<any[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  const [availableFiles, setAvailableFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showDynamicValues, setShowDynamicValues] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (initialConfig) {
        setFields(initialConfig);
        // Restore WhatsApp specific state if needed
        if (type?.id === "whatsapp") {
          setWaMessageType(initialConfig.messageType || "private");
          setWaTargetType(initialConfig.targetType || "private");
          setWaTableId(initialConfig.tableId || "");
          // Phone mode check
          // If it starts with manual:, it's just the value. If not, it's a column.
        }
      } else {
        setFields({});
        setWaTargetType("private");
        setWaMessageType("private");
        setWaTableId("");
        setWaColumns([]);
      }
    }
  }, [isOpen, initialConfig]);

  // Load files for WhatsApp Media
  useEffect(() => {
    if (isOpen && type?.id === "whatsapp" && waMessageType === "media") {
      setLoadingFiles(true);
      getAllFiles()
        .then((files) => setAvailableFiles(files))
        .finally(() => setLoadingFiles(false));
    }
  }, [isOpen, type, waMessageType]);

  // Load columns for WhatsApp Table
  useEffect(() => {
    if (waTableId) {
      setLoadingColumns(true);
      getTableById(Number(waTableId))
        .then((res) => {
          if (res.success && res.data && res.data.schemaJson) {
            const schema = res.data.schemaJson as any;
            if (Array.isArray(schema)) {
              setWaColumns(schema);
            } else if (schema && Array.isArray(schema.columns)) {
              setWaColumns(schema.columns);
            } else {
              setWaColumns([]);
            }
          }
        })
        .finally(() => setLoadingColumns(false));
    } else {
      setWaColumns([]);
    }
  }, [waTableId]);

  if (!isOpen || !type) return null;

  const handleSave = () => {
    if (
      (type.id === "update_record" || type.id === "delete_record") &&
      !fields.recordId
    ) {
      setError("חובה להזין מזהה רשומה");
      return;
    }

    let desc = `${type.label}`;
    let configToSave = { ...fields };

    switch (type.id) {
      case "create_task":
        const assignee =
          users.find((u) => u.id.toString() === fields.assigneeId)?.name ||
          "ללא שיוך";
        desc = `צור משימה: "${fields.title || "ללא כותרת"}" עבור ${assignee}`;
        break;
      case "update_task":
        desc = `עדכן משימה (ID: ${fields.taskId || "?"}) לסטטוס "${
          fields.status || "?"
        }"`;
        break;
      case "delete_task":
        desc = `מחק משימה (ID: ${fields.taskId || "?"})`;
        break;
      case "create_record":
        const tbl =
          tables.find((t) => t.id.toString() === fields.tableId)?.name || "?";
        desc = `צור רשומה בטבלה: ${tbl}`;
        break;
      case "update_record":
        const tblUpd =
          tables.find((t) => t.id.toString() === fields.tableId)?.name || "?";
        desc = `עדכן רשומה (ID: ${
          fields.recordId || "?"
        }) בטבלה ${tblUpd}: שדה "${fields.fieldName || "?"}" = "${
          fields.value || "?"
        }"`;
        break;
      case "delete_record":
        const tblDel =
          tables.find((t) => t.id.toString() === fields.tableId)?.name || "?";
        desc = `מחק רשומה (ID: ${fields.recordId || "?"}) מטבלה ${tblDel}`;
        break;
      case "create_event":
        desc = `צור אירוע ביומן: "${fields.title || "?"}" (${
          fields.duration || "60"
        } דקות)`;
        break;
      case "update_event":
        desc = `עדכן אירוע (ID: ${fields.eventId || "?"})`;
        break;
      case "delete_event":
        desc = `מחק אירוע מהיומן (ID: ${fields.eventId || "?"})`;
        break;
      case "notification":
        const recipient =
          users.find((u) => u.id.toString() === fields.recipientId)?.name ||
          "ללא נמען";
        desc = `שלח התראה ל${recipient}`;
        break;
      case "whatsapp":
        desc = `שלח WhatsApp (${waMessageType === "media" ? "מדיה" : "הודעה"})`;
        configToSave = {
          ...configToSave,
          phoneColumnId: fields.phoneColumnId,
          messageType: waMessageType,
          targetType: waTargetType, // Added
          content: fields.content,
          mediaFileId: fields.mediaFileId,
          tableId: waTableId,
        };
        break;
      case "webhook":
        desc = `Webhook לכתובת: ${fields.url || "..."}`;
        break;
    }

    onSave({
      type: type.id,
      summary: desc,
      config: configToSave,
    });
    setFields({});
    onClose();
  };

  // Helper for table columns (Create Record)
  const selectedTable = tables.find((t) => t.id.toString() === fields.tableId);
  let tableFields: any[] = [];
  if (selectedTable && selectedTable.schemaJson) {
    try {
      const schema =
        typeof selectedTable.schemaJson === "string"
          ? JSON.parse(selectedTable.schemaJson)
          : selectedTable.schemaJson;
      if (Array.isArray(schema)) {
        tableFields = schema;
      } else if (schema && Array.isArray(schema.columns)) {
        tableFields = schema.columns;
      }
    } catch (e) {}
  }

  // Find currently selected field for update logic
  const selectedFieldForUpdate = tableFields.find(
    (f) => f.name === fields.fieldName,
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-indigo-50">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-indigo-900">{type.label}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-indigo-100 rounded-full text-indigo-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* --- TASK ACTIONS --- */}
          {type.id === "create_task" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  כותרת המשימה
                </label>
                <input
                  className="w-full p-2 border rounded-md"
                  placeholder="שם המשימה"
                  value={fields.title || ""}
                  onChange={(e) =>
                    setFields({ ...fields, title: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  תיאור
                </label>
                <textarea
                  className="w-full p-2 border rounded-md"
                  placeholder="תיאור (אופציונלי)"
                  rows={3}
                  value={fields.description || ""}
                  onChange={(e) =>
                    setFields({ ...fields, description: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    תאריך יעד (בעוד X ימים)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full p-2 border rounded-md"
                    placeholder="0 = היום"
                    value={fields.dueDateOffset || ""}
                    onChange={(e) =>
                      setFields({ ...fields, dueDateOffset: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    סטטוס
                  </label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={fields.status || "todo"}
                    onChange={(e) =>
                      setFields({ ...fields, status: e.target.value })
                    }
                  >
                    <option value="todo">משימות</option>
                    <option value="in_progress">משימות בטיפול</option>
                    <option value="waiting_client">ממתינים לאישור לקוח</option>
                    <option value="on_hold">משימות בהשהייה</option>
                    <option value="completed_month">בוצעו החודש</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    עדיפות
                  </label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={fields.priority || "low"}
                    onChange={(e) =>
                      setFields({ ...fields, priority: e.target.value })
                    }
                  >
                    <option value="high">גבוה</option>
                    <option value="medium">בינוני</option>
                    <option value="low">נמוך</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    אחראי
                  </label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={fields.assigneeId || ""}
                    onChange={(e) =>
                      setFields({ ...fields, assigneeId: e.target.value })
                    }
                  >
                    <option value="">ללא אחראי</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  תגיות
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    value={fields.tagInput || ""}
                    onChange={(e) =>
                      setFields({ ...fields, tagInput: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const tag = (fields.tagInput || "").trim();
                        if (tag && !(fields.tags || []).includes(tag)) {
                          setFields({
                            ...fields,
                            tags: [...(fields.tags || []), tag],
                            tagInput: "",
                          });
                        }
                      }
                    }}
                    placeholder="הקלד תגית ולחץ Enter"
                    className="flex-1 p-2 border rounded-md text-sm"
                  />
                  <button
                    onClick={() => {
                      const tag = (fields.tagInput || "").trim();
                      if (tag && !(fields.tags || []).includes(tag)) {
                        setFields({
                          ...fields,
                          tags: [...(fields.tags || []), tag],
                          tagInput: "",
                        });
                      }
                    }}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded transition-colors text-sm border border-gray-200"
                  >
                    הוסף
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(fields.tags || []).map((tag: string) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-1 rounded-full text-xs border border-blue-100"
                    >
                      {tag}
                      <button
                        onClick={() => {
                          setFields({
                            ...fields,
                            tags: fields.tags.filter((t: string) => t !== tag),
                          });
                        }}
                        className="hover:text-blue-800 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
          {(type.id === "update_task" || type.id === "delete_task") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                מזהה המשימה (ID)
              </label>
              <input
                className="w-full p-2 border rounded-md font-mono text-sm"
                placeholder="Task ID..."
                onChange={(e) =>
                  setFields({ ...fields, taskId: e.target.value })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                הזן את המזהה הייחודי של המשימה אותה תרצה ל
                {type.id === "update_task" ? "עדכן" : "למחוק"}.
              </p>
            </div>
          )}
          {type.id === "update_task" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                סטטוס חדש
              </label>
              <select
                className="w-full p-2 border rounded-md"
                onChange={(e) =>
                  setFields({ ...fields, status: e.target.value })
                }
              >
                <option value="">ללא שינוי</option>
                <option value="todo">לביצוע</option>
                <option value="in_progress">בטיפול</option>
                <option value="on_hold">בהשהייה</option>
                <option value="done">בוצע</option>
              </select>
            </div>
          )}

          {/* --- RECORD ACTIONS --- */}
          {(type.id === "create_record" ||
            type.id === "update_record" ||
            type.id === "delete_record") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                בחר טבלה
              </label>
              {tables.length === 0 ? (
                <p className="text-orange-500 text-sm">
                  לא נמצאו טבלאות במערכת
                </p>
              ) : (
                <select
                  className="w-full p-2 border rounded-md"
                  value={fields.tableId || ""}
                  onChange={(e) =>
                    setFields({ ...fields, tableId: e.target.value })
                  }
                >
                  <option value="">בחר טבלה...</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {(type.id === "update_record" || type.id === "delete_record") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                מזהה רשומה (ID) <span className="text-red-500">*</span>
              </label>
              <input
                className={`w-full p-2 border rounded-md ${
                  error ? "border-red-500" : ""
                }`}
                placeholder="Record ID..."
                value={fields.recordId || ""}
                onChange={(e) => {
                  setFields({ ...fields, recordId: e.target.value });
                  if (error) setError(null);
                }}
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
          )}
          {type.id === "create_record" && fields.tableId && (
            <div className="bg-gray-50 p-3 rounded border">
              <p className="text-xs font-bold text-gray-500 mb-2">
                ערכי שדות (JSON)
              </p>
              {tableFields.map((f: any) => {
                const currentValues = fields.values || {};
                const val = currentValues[f.name] || "";

                return (
                  <div
                    key={f.name}
                    className="mb-2 last:mb-0 grid grid-cols-3 gap-2 items-center"
                  >
                    <span className="text-xs text-gray-600 truncate col-span-1">
                      {f.label || f.name}
                    </span>
                    {f.type === "select" ||
                    f.type === "status" ||
                    f.type === "priority" ? (
                      <select
                        className="col-span-2 p-1 text-sm border rounded"
                        value={val}
                        onChange={(e) => {
                          const newValues = {
                            ...currentValues,
                            [f.name]: e.target.value,
                          };
                          setFields({ ...fields, values: newValues });
                        }}
                      >
                        <option value="">בחר אפשרות...</option>
                        {(f.options || []).map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="col-span-2 p-1 text-sm border rounded"
                        placeholder="ערך..."
                        value={val}
                        onChange={(e) => {
                          const newValues = {
                            ...currentValues,
                            [f.name]: e.target.value,
                          };
                          setFields({ ...fields, values: newValues });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {type.id === "update_record" && fields.tableId && (
            <div className="space-y-3 p-3 bg-gray-50 rounded border">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  שדה לעדכון
                </label>
                <select
                  className="w-full p-1 border rounded text-sm"
                  onChange={(e) =>
                    setFields({
                      ...fields,
                      fieldName: e.target.value,
                      value: "",
                      operation: "",
                    })
                  }
                  value={fields.fieldName || ""}
                >
                  <option value="">בחר שדה...</option>
                  {tableFields.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.label || f.name} ({f.type})
                    </option>
                  ))}
                </select>
              </div>

              {selectedFieldForUpdate && (
                <>
                  {selectedFieldForUpdate.type === "select" ||
                  selectedFieldForUpdate.type === "status" ||
                  selectedFieldForUpdate.type === "priority" ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        ערך חדש
                      </label>
                      <select
                        className="w-full p-1 border rounded text-sm"
                        value={fields.value || ""}
                        onChange={(e) =>
                          setFields({ ...fields, value: e.target.value })
                        }
                      >
                        <option value="">בחר אפשרות...</option>
                        {(selectedFieldForUpdate.options || []).map(
                          (opt: string) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  ) : selectedFieldForUpdate.type === "number" ||
                    selectedFieldForUpdate.type === "score" ||
                    selectedFieldForUpdate.type === "currency" ? (
                    <div className="flex gap-2">
                      <div className="w-1/3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          פעולה
                        </label>
                        <select
                          className="w-full p-1 border rounded text-sm dir-ltr"
                          value={fields.operation || "set"}
                          onChange={(e) =>
                            setFields({ ...fields, operation: e.target.value })
                          }
                        >
                          <option value="set">=</option>
                          <option value="add">+</option>
                          <option value="subtract">-</option>
                          <option value="multiply">*</option>
                          <option value="divide">/</option>
                        </select>
                      </div>
                      <div className="w-2/3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          ערך
                        </label>
                        <input
                          type="number"
                          className="w-full p-1 border rounded text-sm"
                          placeholder="מספר..."
                          value={fields.value || ""}
                          onChange={(e) =>
                            setFields({ ...fields, value: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        ערך חדש
                      </label>
                      <input
                        className="w-full p-1 border rounded text-sm"
                        placeholder="ערך..."
                        value={fields.value || ""}
                        onChange={(e) =>
                          setFields({ ...fields, value: e.target.value })
                        }
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* --- CALENDAR ACTIONS --- */}
          {type.id === "create_event" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  כותרת האירוע
                </label>
                <input
                  className="w-full p-2 border rounded-md"
                  placeholder="פגישה עם..."
                  value={fields.title || ""}
                  onChange={(e) =>
                    setFields({ ...fields, title: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  תיאור
                </label>
                <textarea
                  className="w-full p-2 border rounded-md"
                  placeholder="תיאור האירוע..."
                  rows={3}
                  value={fields.description || ""}
                  onChange={(e) =>
                    setFields({ ...fields, description: e.target.value })
                  }
                />
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-3">
                <div className="flex gap-4 border-b border-gray-200 pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="timingMode"
                      checked={fields.timingMode !== "relative"}
                      onChange={() =>
                        setFields({ ...fields, timingMode: "fixed" })
                      }
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      בשעה קבוע
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="timingMode"
                      checked={fields.timingMode === "relative"}
                      onChange={() =>
                        setFields({ ...fields, timingMode: "relative" })
                      }
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      בעוד פרק זמן (מהרגע)
                    </span>
                  </label>
                </div>

                {fields.timingMode === "relative" ? (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        בעוד (שעות)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="w-full p-2 border rounded-md"
                        placeholder="0"
                        value={fields.hoursOffset || 0}
                        onChange={(e) =>
                          setFields({ ...fields, hoursOffset: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        בעוד (דקות)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        className="w-full p-2 border rounded-md"
                        placeholder="0"
                        value={fields.minutesOffset || 0}
                        onChange={(e) =>
                          setFields({
                            ...fields,
                            minutesOffset: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        בעוד (ימים)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="w-full p-2 border rounded-md"
                        placeholder="0 = היום"
                        value={fields.daysOffset || 0}
                        onChange={(e) =>
                          setFields({ ...fields, daysOffset: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        שעה קבועה
                      </label>
                      <input
                        type="time"
                        className="w-full p-2 border rounded-md"
                        value={fields.startTime || "09:00"}
                        onChange={(e) =>
                          setFields({ ...fields, startTime: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    משך (דקות)
                  </label>
                  <input
                    type="number"
                    min="15"
                    step="15"
                    className="w-full p-2 border rounded-md"
                    value={fields.duration || 60}
                    onChange={(e) =>
                      setFields({ ...fields, duration: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  צבע
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    "#3788d8", // Blue
                    "#7b1fa2", // Purple
                    "#2e7d32", // Green
                    "#d32f2f", // Red
                    "#f57c00", // Orange
                    "#0097a7", // Cyan
                    "#5d4037", // Brown
                  ].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFields({ ...fields, color: c })}
                      className={`w-8 h-8 rounded-full transition-transform border border-transparent hover:border-gray-300 ${
                        (fields.color || "#3788d8") === c
                          ? "ring-2 ring-offset-2 ring-gray-400 scale-110"
                          : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          {(type.id === "update_event" || type.id === "delete_event") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                מזהה אירוע (Event ID)
              </label>
              <input
                className="w-full p-2 border rounded-md"
                placeholder="..."
                onChange={(e) =>
                  setFields({ ...fields, eventId: e.target.value })
                }
              />
            </div>
          )}

          {/* --- NOTIFICATIONS --- */}
          {type.id === "notification" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  תוכן ההתראה
                </label>
                <textarea
                  className="w-full p-2 border rounded-md"
                  placeholder="הודעה שתופיע בפעמון..."
                  rows={3}
                  onChange={(e) =>
                    setFields({ ...fields, message: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  נמען
                </label>
                <select
                  className="w-full p-2 border rounded-md"
                  onChange={(e) =>
                    setFields({ ...fields, recipientId: e.target.value })
                  }
                >
                  <option value="">בחר משתמש...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* --- WHATSAPP --- */}
          {type.id === "whatsapp" && (
            <div className="space-y-5">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <label className="block text-sm font-medium text-blue-900 mb-1">
                  הגדרת טבלה (עבור משתנים ומספרים)
                </label>
                <select
                  className="w-full p-2 border rounded-md text-sm"
                  value={waTableId}
                  onChange={(e) => setWaTableId(e.target.value)}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  למי לשלוח?
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors flex-1">
                    <input
                      type="radio"
                      name="waTargetType"
                      value="private"
                      checked={waTargetType === "private"}
                      onChange={() => {
                        setWaTargetType("private");
                        setFields({ ...fields, phoneColumnId: "" });
                      }}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium text-gray-700">אדם פרטי</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors flex-1">
                    <input
                      type="radio"
                      name="waTargetType"
                      value="group"
                      checked={waTargetType === "group"}
                      onChange={() => {
                        setWaTargetType("group");
                        setFields({ ...fields, phoneColumnId: "manual:" });
                      }}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium text-gray-700">קבוצה</span>
                  </label>
                </div>
              </div>

              {waTargetType === "private" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    פרטי הנמען
                  </label>
                  <div className="flex gap-4 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="phoneMode"
                        checked={
                          !String(fields.phoneColumnId || "").startsWith(
                            "manual:",
                          )
                        }
                        onChange={() =>
                          setFields({ ...fields, phoneColumnId: "" })
                        }
                        className="text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700">
                        לפי עמודה בטבלה
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="phoneMode"
                        checked={String(fields.phoneColumnId || "").startsWith(
                          "manual:",
                        )}
                        onChange={() =>
                          setFields({ ...fields, phoneColumnId: "manual:" })
                        }
                        className="text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700">
                        מספר ידני קבוע
                      </span>
                    </label>
                  </div>

                  {!String(fields.phoneColumnId || "").startsWith("manual:") ? (
                    <div>
                      <select
                        value={fields.phoneColumnId || ""}
                        onChange={(e) =>
                          setFields({
                            ...fields,
                            phoneColumnId: e.target.value,
                          })
                        }
                        disabled={!waTableId}
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                      >
                        <option value="">
                          {waTableId ? "בחר עמודה..." : "יש לבחור טבלה למעלה"}
                        </option>
                        {waColumns.map((col: any) => (
                          <option key={col.id || col.name} value={col.name}>
                            {col.label || col.name} ({col.type})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={String(fields.phoneColumnId || "").replace(
                          "manual:",
                          "",
                        )}
                        onChange={(e) =>
                          setFields({
                            ...fields,
                            phoneColumnId: `manual:${e.target.value}`,
                          })
                        }
                        placeholder="הכנס מספר טלפון (לדוגמה: 0501234567)"
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500"
                        dir="ltr"
                      />
                      <div className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                        <strong>תצוגה מקדימה:</strong>{" "}
                        <span dir="ltr" className="font-mono">
                          {formatPhonePreview(
                            String(fields.phoneColumnId || "").replace(
                              "manual:",
                              "",
                            ),
                            "private",
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    מזהה קבוצה (Group ID)
                  </label>
                  <input
                    type="text"
                    value={String(fields.phoneColumnId || "").replace(
                      "manual:",
                      "",
                    )}
                    onChange={(e) =>
                      setFields({
                        ...fields,
                        phoneColumnId: `manual:${e.target.value}`,
                      })
                    }
                    placeholder="לדוגמה: 12345678@g.us"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500 font-mono text-sm"
                    dir="ltr"
                  />
                  <div className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                    <strong>תצוגה מקדימה:</strong>{" "}
                    <span dir="ltr" className="font-mono">
                      {formatPhonePreview(
                        String(fields.phoneColumnId || "").replace(
                          "manual:",
                          "",
                        ),
                        "group",
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  סוג הודעה
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors flex-1">
                    <input
                      type="radio"
                      name="waMessageType"
                      value="private"
                      checked={waMessageType === "private"}
                      onChange={() => setWaMessageType("private")}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium text-gray-700">
                      הודעה רגילה
                    </span>
                  </label>
                  <label className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors flex-1">
                    <input
                      type="radio"
                      name="waMessageType"
                      value="media"
                      checked={waMessageType === "media"}
                      onChange={() => setWaMessageType("media")}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium text-gray-700">
                      הודעה עם מדיה
                    </span>
                  </label>
                </div>
              </div>

              {waMessageType === "media" && (
                <div className="animate-in slide-in-from-top-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    בחר קובץ לשליחה
                  </label>
                  {loadingFiles ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                      <Loader2 className="animate-spin" size={16} /> טוען
                      קבצים...
                    </div>
                  ) : (
                    <select
                      value={fields.mediaFileId || ""}
                      onChange={(e) =>
                        setFields({ ...fields, mediaFileId: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm"
                    >
                      <option value="">בחר קובץ מהמערכת...</option>
                      {availableFiles.map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.name} ({file.type})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {waMessageType === "media"
                    ? "כיתוב (Caption)"
                    : "תוכן ההודעה"}
                </label>
                <textarea
                  value={fields.content || ""}
                  onChange={(e) =>
                    setFields({ ...fields, content: e.target.value })
                  }
                  rows={4}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  placeholder="הקלד את ההודעה כאן..."
                />
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setShowDynamicValues(!showDynamicValues)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    לפתיחת הערכים לשימוש מהרשומה הנוכחית לחץ כאן:
                    <ChevronDown
                      size={16}
                      className={`transition-transform ${showDynamicValues ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showDynamicValues && (
                    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {waColumns.length > 0 ? (
                        waColumns.map((col: any) => (
                          <button
                            key={col.id || col.name}
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`{${col.name}}`);
                            }}
                            className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded text-xs hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                            title="לחץ להעתקה"
                          >
                            <span
                              className="font-mono text-gray-600 truncate max-w-[120px]"
                              dir="ltr"
                            >{`{${col.name}}`}</span>
                            <Copy
                              size={12}
                              className="text-gray-400 group-hover:text-blue-500"
                            />
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-gray-500 col-span-2">
                          {waTableId
                            ? "לא נמצאו עמודות."
                            : "יש לבחור טבלה למעלה."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* --- WEBHOOK --- */}
          {type.id === "webhook" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                כתובת URL
              </label>
              <input
                className="w-full p-2 border rounded-md ltr"
                placeholder="https://api.external.com/webhook..."
                dir="ltr"
                onChange={(e) => setFields({ ...fields, url: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="p-4 flex justify-end gap-2 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 bg-white"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded bg-indigo-600 text-white"
          >
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// CONDITION CONFIG MODAL
// ----------------------------------------------------------------------

function ConditionConfigModal({
  isOpen,
  onClose,
  onSave,
  type,
  tables,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (description: string) => void;
  type: any;
  tables: any[];
}) {
  const [fields, setFields] = useState<any>({});

  if (!isOpen || !type) return null;

  const handleSave = () => {
    let desc = `${type.label}`;

    if (type.id === "status") {
      desc = `כאשר הסטטוס בטבלת "${
        tables.find((t) => t.id.toString() === fields.tableId)?.name || "?"
      }" הוא "${fields.status || "?"}"`;
    } else if (type.id === "field") {
      const t = tables.find((t) => t.id.toString() === fields.tableId);
      desc = `כאשר שדה "${fields.fieldName || "?"}" בטבלת "${
        t?.name || "?"
      }" שווה ל-"${fields.value || "?"}"`;
    } else if (type.id === "time") {
      desc = `המתן ${fields.amount || "0"} ${
        fields.unit === "hours" ? "שעות" : "ימים"
      }`;
    }

    onSave(desc);
    setFields({});
    onClose();
  };

  // Helper for table columns
  const selectedTable = tables.find((t) => t.id.toString() === fields.tableId);
  let tableFields: string[] = [];
  if (selectedTable && selectedTable.schemaJson) {
    try {
      const schema =
        typeof selectedTable.schemaJson === "string"
          ? JSON.parse(selectedTable.schemaJson)
          : selectedTable.schemaJson;
      if (Array.isArray(schema)) {
        tableFields = schema.map((col: any) => col.name);
      }
    } catch (e) {}
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-purple-50">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-purple-900">{type.label}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-purple-100 rounded-full text-purple-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {type.id === "time" && (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  כמות
                </label>
                <input
                  type="number"
                  className="w-full p-2 border rounded-md"
                  value={fields.amount || ""}
                  onChange={(e) =>
                    setFields({ ...fields, amount: e.target.value })
                  }
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  יחידת זמן
                </label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={fields.unit || "days"}
                  onChange={(e) =>
                    setFields({ ...fields, unit: e.target.value })
                  }
                >
                  <option value="days">ימים</option>
                  <option value="hours">שעות</option>
                </select>
              </div>
            </div>
          )}

          {type.id === "status" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  בחר טבלה לבדיקה
                </label>
                <select
                  className="w-full p-2 border rounded-md"
                  onChange={(e) =>
                    setFields({ ...fields, tableId: e.target.value })
                  }
                  value={fields.tableId || ""}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  סטטוס נדרש
                </label>
                <input
                  className="w-full p-2 border rounded-md"
                  placeholder="לדוגמה: בוצע / בטיפול"
                  onChange={(e) =>
                    setFields({ ...fields, status: e.target.value })
                  }
                  value={fields.status || ""}
                />
              </div>
            </>
          )}

          {type.id === "field" && (
            <>
              {tables.length === 0 ? (
                <div className="text-center py-4 bg-orange-50 rounded-lg border border-orange-100">
                  <AlertTriangle
                    className="mx-auto text-orange-500 mb-2"
                    size={24}
                  />
                  <div>
                    <p className="text-sm font-semibold text-orange-800">
                      לא נמצאו טבלאות
                    </p>
                    <p className="text-xs text-orange-600 mt-1">
                      יש ליצור טבלה כדי להשתמש בתנאי מבוסס שדות.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      בחר טבלה לבדיקה
                    </label>
                    <select
                      className="w-full p-2 border rounded-md"
                      onChange={(e) =>
                        setFields({
                          ...fields,
                          tableId: e.target.value,
                          fieldName: "",
                        })
                      }
                      value={fields.tableId || ""}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      שדה לבדיקה
                    </label>
                    <select
                      className="w-full p-2 border rounded-md disabled:bg-gray-100"
                      onChange={(e) =>
                        setFields({ ...fields, fieldName: e.target.value })
                      }
                      disabled={!fields.tableId}
                      value={fields.fieldName || ""}
                    >
                      <option value="">בחר שדה...</option>
                      {tableFields.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      חייב להיות שווה ל-
                    </label>
                    <input
                      className="w-full p-2 border rounded-md"
                      placeholder="הערך הנדרש..."
                      onChange={(e) =>
                        setFields({ ...fields, value: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 bg-gray-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={
              (type.id === "status" || type.id === "field") &&
              tables.length === 0
            }
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            שמור תנאי
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// SUB-MODALS
// ----------------------------------------------------------------------

function ConditionSelectionModal({ isOpen, onClose, onSelect }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-gray-900">בחר תנאי מעבר</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-full text-gray-500"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-2 grid gap-2">
          {CONDITION_TYPES.map((item) => (
            <button
              key={item.id}
              disabled={item.comingSoon}
              onClick={() => {
                if (!item.comingSoon) onSelect(item);
              }}
              className={`flex items-center gap-4 p-3 rounded-lg text-right transition-colors border border-transparent group relative ${
                item.comingSoon ? "opacity-60 bg-gray-50" : "hover:bg-purple-50"
              }`}
            >
              <div className={`p-2 rounded-lg ${item.color}`}>
                <item.icon size={20} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{item.label}</div>
                {item.comingSoon && (
                  <span className="text-[10px] bg-gray-200 px-1 rounded">
                    בקרוב
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// DELETE CONFIRMATION MODAL
// ----------------------------------------------------------------------

function DeleteAutomationAlert({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <AlertTriangle className="text-red-600" size={24} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            מחיקת אוטומציה
          </h3>
          <p className="text-gray-500 text-sm mb-6">
            האם אתה בטוח שברצונך למחוק את האוטומציה? <br />
            פעולה זו היא בלתי הפיכה.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
            >
              ביטול
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
            >
              מחק אוטומציה
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// MAIN COMPONENT
// ----------------------------------------------------------------------

export function StageDetailModal({
  stage,
  isOpen,
  onClose,
  isCreating = false,
  onSave,
  onUpdate,
  onDelete,
}: StageDetailModalProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<any>(null);

  // Selection Modal State
  const [isAutomationModalOpen, setIsAutomationModalOpen] = useState(false);
  const [isConditionModalOpen, setIsConditionModalOpen] = useState(false);

  const [configuringAutomation, setConfiguringAutomation] = useState<any>(null);
  const [configuringCondition, setConfiguringCondition] = useState<any>(null);
  const [automationToDelete, setAutomationToDelete] = useState<number | null>(
    null,
  );

  // View/Edit Mode
  const [isEditing, setIsEditing] = useState(false);

  // Dynamic Data
  const [users, setUsers] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      // Load data when modal opens
      fetch("/api/users")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setUsers(data);
        })
        .catch((err) => console.error("Error loading users", err));

      fetch("/api/tables")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setTables(data);
        })
        .catch((err) => console.error("Error loading tables", err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (stage) {
      const details =
        typeof stage.details === "object" ? (stage.details as any) : {};
      setFormData({
        name: stage.name,
        color: stage.color || "blue",
        icon: stage.icon || "Circle",
        whatHappens: details.whatHappens || stage.description || "",
        systemActions: Array.isArray(details.systemActions)
          ? details.systemActions
          : [],
        goals: details.goals || "",
        conditions: Array.isArray(details.conditions) ? details.conditions : [],
      });
      setIsEditing(false);
    } else if (isCreating) {
      setFormData({
        name: "",
        color: "blue",
        icon: "Circle",
        whatHappens: "",
        systemActions: [],
        goals: "",
        conditions: [],
      });
      setIsEditing(true);
    }
  }, [stage, isCreating, isOpen]);

  if (!isOpen) return null;
  if (!stage && !isCreating) return null;
  if (!formData && isOpen) return null; // Wait for initialization

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        alert("נא להזין שם לשלב");
        return;
      }

      const details = {
        whatHappens: formData.whatHappens,
        systemActions: formData.systemActions,
        goals: formData.goals,
        conditions: formData.conditions,
      };

      if (isCreating && onSave) {
        await onSave({
          name: formData.name,
          color: formData.color,
          icon: formData.icon,
          description: formData.whatHappens,
          details,
        });
        onClose();
        return;
      }

      // @ts-ignore
      const updatedStage = await updateStage(stage!.id, {
        name: formData.name,
        color: formData.color,
        icon: formData.icon,
        description: formData.whatHappens,
        details,
      });

      if (onUpdate) {
        // Optimistic update via callback
        // @ts-ignore
        onUpdate(updatedStage);
      } else {
        router.refresh();
      }
      setIsEditing(false);
      onClose();
    } catch (error) {
      console.error("Failed to save stage:", error);
      alert("שגיאה בשמירת השינויים");
    }
  };

  const handleDelete = async () => {
    if (!stage) return;
    if (confirm("האם אתה בטוח שברצונך למחוק שלב זה?")) {
      try {
        await deleteStage(stage.id);

        if (onDelete) {
          onDelete(stage.id);
        } else {
          router.refresh();
        }

        onClose();
      } catch (error) {
        console.error("Failed to delete stage:", error);
        alert("שגיאה במחיקת השלב");
      }
    }
  };

  const addAutomation = (data: {
    type: string;
    summary: string;
    config: any;
  }) => {
    setFormData((prev: any) => ({
      ...prev,
      systemActions: [...(prev.systemActions || []), data],
    }));
  };

  const addCondition = (description: string) => {
    setFormData((prev: any) => ({
      ...prev,
      conditions: [...(prev.conditions || []), description],
    }));
  };

  const removeItem = (field: "systemActions" | "conditions", index: number) => {
    setFormData((prev: any) => {
      const newItems = [...(prev[field] || [])];
      newItems.splice(index, 1);
      return { ...prev, [field]: newItems };
    });
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <div
        className={`
          fixed top-0 left-0 h-full w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-spring overflow-hidden flex flex-col
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        dir="rtl"
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white z-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div
                className={`w-10 h-10 rounded-xl bg-${
                  formData.color || "blue"
                }-50 text-${
                  formData.color || "blue"
                }-600 flex items-center justify-center`}
              >
                {(() => {
                  const IconComp =
                    (LucideIcons as any)[formData.icon] || LucideIcons.Circle;
                  return <IconComp size={20} />;
                })()}
              </div>
              {isEditing ? (
                <input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="text-xl font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-indigo-500 outline-none px-1"
                />
              ) : (
                <h2 className="text-xl font-bold text-gray-900">
                  {formData.name}
                </h2>
              )}
            </div>
            <p className="text-gray-500 text-sm mr-12">
              הגדרת פרטי שלב, אוטומציות ותנאי מעבר
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`p-2 rounded-lg transition-colors ${
                isEditing
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              }`}
            >
              {isEditing ? <Save size={20} /> : <Edit2 size={20} />}
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={20} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Section: Description */}
          <section>
            <div className="flex items-center gap-2 mb-3 text-gray-900 font-medium">
              <Info size={18} className="text-blue-500" />
              <h3>תיאור השלב</h3>
            </div>
            {isEditing ? (
              <textarea
                value={formData.whatHappens}
                onChange={(e) =>
                  setFormData({ ...formData, whatHappens: e.target.value })
                }
                className="w-full min-h-[100px] p-3 text-sm border-gray-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 bg-white"
                placeholder="תאר מה קורה בשלב זה..."
              />
            ) : (
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">
                {formData.whatHappens || "אין תיאור."}
              </p>
            )}
          </section>

          {/* Section: Goals */}
          <section>
            <div className="flex items-center gap-2 mb-3 text-gray-900 font-medium">
              <Target size={18} className="text-emerald-500" />
              <h3>מטרת השלב</h3>
            </div>
            {isEditing ? (
              <textarea
                value={formData.goals}
                onChange={(e) =>
                  setFormData({ ...formData, goals: e.target.value })
                }
                className="w-full min-h-[80px] p-3 text-sm border-gray-200 rounded-xl focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                placeholder="מה המטרה העסקית של שלב זה?..."
              />
            ) : (
              <p className="text-gray-600 text-sm border-r-2 border-emerald-500 pr-4 whitespace-pre-wrap">
                {formData.goals || "לא הוגדר."}
              </p>
            )}
          </section>

          {/* Section: Conditions */}
          <section>
            <div className="flex items-center gap-2 mb-3 text-gray-900 font-medium">
              <GitCommit size={18} className="text-purple-500" />
              <h3>תנאי מעבר</h3>
            </div>

            <div className="flex flex-wrap gap-2">
              {formData.conditions.map((cond: string, i: number) => (
                <span
                  key={i}
                  className="px-3 py-1 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-100 flex items-center gap-2 group"
                >
                  {cond}
                  {isEditing && (
                    <button
                      onClick={() => removeItem("conditions", i)}
                      className="hover:text-purple-900 bg-purple-100 rounded-full p-0.5"
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
              {isEditing && (
                <button
                  onClick={() => setIsConditionModalOpen(true)}
                  className="px-3 py-1 bg-gray-50 text-gray-600 text-xs rounded-full border border-gray-200 border-dashed hover:border-purple-300 hover:text-purple-600 flex items-center gap-1 transition-all"
                >
                  <Plus size={12} />
                  הוסף תנאי
                </button>
              )}
            </div>
            {formData.conditions.length === 0 && !isEditing && (
              <p className="text-gray-400 text-sm italic">אין תנאי מעבר.</p>
            )}
          </section>

          {/* Section: Automations */}
          <section>
            <div className="flex items-center gap-2 mb-3 text-gray-900 font-medium">
              <Zap size={18} className="text-orange-500" />
              <h3>אוטומציות (System Actions)</h3>
            </div>

            <div className="space-y-2">
              {formData.systemActions.map((action: any, i: number) => {
                const getActionType = (id: string) =>
                  AUTOMATION_CATEGORIES.flatMap((c) => c.actions).find(
                    (a) => a.id === id,
                  );
                const actionType = getActionType(action.type);

                const isLegacy = typeof action === "string";
                const summary = isLegacy
                  ? action
                  : action.summary || actionType?.label || action.type;

                const Icon = actionType?.icon || Zap;

                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 group"
                  >
                    <div className="p-1.5 bg-white rounded-lg shadow-sm text-orange-500 mt-0.5">
                      <Icon size={14} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{summary}</p>
                    </div>
                    {isEditing && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            const typeObj = getActionType(action.type);
                            if (typeObj) {
                              setConfiguringAutomation({
                                type: typeObj,
                                config: action.config,
                                index: i,
                              });
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-indigo-500"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => setAutomationToDelete(i)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {isEditing && (
                <button
                  onClick={() => setIsAutomationModalOpen(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-orange-200 hover:text-orange-600 hover:bg-orange-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Plus size={16} />
                  הוסף פעולה אוטומטית
                </button>
              )}
            </div>
          </section>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-4">
          {isEditing ? (
            <>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              >
                <Trash2 size={16} />
                מחק
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium"
                >
                  ביטול
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm shadow-indigo-200"
                >
                  <Save size={16} />
                  שמור שינויים
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              >
                <Trash2 size={16} />
                מחק שלב
              </button>
              <button
                onClick={() => (isCreating ? onClose() : setIsEditing(true))}
                className={`flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm shadow-indigo-200 ${
                  isCreating ? "hidden" : ""
                }`}
              >
                <Edit2 size={16} />
                ערוך הגדרות
              </button>
              {isCreating && (
                <div className="flex gap-2 w-full justify-end">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm shadow-indigo-200"
                  >
                    <Plus size={16} />
                    צור שלב
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* --- MODALS --- */}

      <ActionSelectionModal
        isOpen={isAutomationModalOpen}
        onClose={() => setIsAutomationModalOpen(false)}
        onSelect={(item) => {
          setIsAutomationModalOpen(false);
          setConfiguringAutomation(item);
        }}
      />

      <DeleteAutomationAlert
        isOpen={automationToDelete !== null}
        onClose={() => setAutomationToDelete(null)}
        onConfirm={() => {
          if (automationToDelete !== null) {
            removeItem("systemActions", automationToDelete);
            setAutomationToDelete(null);
          }
        }}
      />

      <AutomationConfigModal
        isOpen={!!configuringAutomation}
        type={configuringAutomation?.type || configuringAutomation}
        initialConfig={configuringAutomation?.config}
        users={users}
        tables={tables}
        onClose={() => setConfiguringAutomation(null)}
        onSave={(data) => {
          if (configuringAutomation?.index !== undefined) {
            // Update existing
            setFormData((prev: any) => {
              const newActions = [...(prev.systemActions || [])];
              newActions[configuringAutomation.index] = data;
              return { ...prev, systemActions: newActions };
            });
          } else {
            // Add new
            addAutomation(data);
          }
        }}
      />

      <ConditionSelectionModal
        isOpen={isConditionModalOpen}
        onClose={() => setIsConditionModalOpen(false)}
        onSelect={(item: any) => {
          setIsConditionModalOpen(false);
          if (
            item.id === "time" ||
            item.id === "status" ||
            item.id === "field"
          ) {
            setConfiguringCondition(item);
          } else {
            addCondition(item.label);
          }
        }}
      />

      <ConditionConfigModal
        isOpen={!!configuringCondition}
        type={configuringCondition}
        tables={tables}
        onClose={() => setConfiguringCondition(null)}
        onSave={addCondition}
      />
    </>
  );
}
