import {
  Bell, CheckSquare, RefreshCw, MessageSquare, Globe, UserPlus,
  FilePlus, Calendar, Timer, Clock, Eye, Phone, Zap, AlertTriangle,
  Play, Layers, Send, ListPlus, Calculator, Activity,
  type LucideIcon,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FlowStep {
  id: string;
  kind: "trigger" | "action";
  type: string;
  config: Record<string, any>;
  label: string;
}

export interface AutomationSchema {
  name: string;
  description?: string;
  category?: string;
  triggerType: string;
  triggerConfig: any;
  actionType: string;
  actionConfig: any;
}

export interface FieldConfig {
  key: string;
  label: string;
  inputType: "text" | "textarea" | "number" | "select" | "user-select" | "table-select" | "column-select" | "column-value" | "whatsapp-phone";
  placeholder?: string;
  options?: { value: string; label: string }[];
  optional?: boolean;
}

// ─── Label Mappings ──────────────────────────────────────────────────────────

export const TRIGGER_LABELS: Record<string, string> = {
  NEW_RECORD: "רשומה חדשה",
  RECORD_CREATE: "יצירת רשומה",
  RECORD_FIELD_CHANGE: "שינוי שדה ברשומה",
  TASK_STATUS_CHANGE: "שינוי סטטוס משימה",
  TICKET_STATUS_CHANGE: "שינוי סטטוס פנייה",
  MULTI_EVENT_DURATION: "אירועים מרובים",
  DIRECT_DIAL: "חיוג ישיר",
  VIEW_METRIC_THRESHOLD: "סף מדד בתצוגה",
  TIME_SINCE_CREATION: "זמן מאז יצירה",
  SLA_BREACH: "הפרת SLA",
  EVENT_TIME: "זמן אירוע ביומן",
  MANUAL: "ידני",
};

export const ACTION_LABELS: Record<string, string> = {
  SEND_NOTIFICATION: "שליחת התראה",
  CREATE_TASK: "יצירת משימה",
  UPDATE_RECORD_FIELD: "עדכון שדה ברשומה",
  SEND_WHATSAPP: "שליחת וואטסאפ",
  WEBHOOK: "Webhook",
  ADD_TO_NURTURE_LIST: "הוספה לרשימת דיוור",
  CREATE_RECORD: "יצירת רשומה",
  CREATE_CALENDAR_EVENT: "יצירת אירוע ביומן",
  CALCULATE_DURATION: "חישוב משך זמן",
  CALCULATE_MULTI_EVENT_DURATION: "חישוב זמנים מרובים",
  MULTI_ACTION: "פעולות מרובות",
};

export const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  notifications: { label: "התראות", color: "bg-blue-100 text-blue-700" },
  tasks: { label: "משימות", color: "bg-green-100 text-green-700" },
  data: { label: "נתונים", color: "bg-purple-100 text-purple-700" },
  communication: { label: "תקשורת", color: "bg-pink-100 text-pink-700" },
  workflow: { label: "תהליכים", color: "bg-orange-100 text-orange-700" },
  monitoring: { label: "ניטור", color: "bg-yellow-100 text-yellow-700" },
};

// ─── Tier Limits & Selectable Types ─────────────────────────────────────────

export const TIER_ACTION_LIMITS: Record<string, number> = {
  basic: 2,
  premium: 6,
  super: Infinity,
};

export const SELECTABLE_TRIGGER_TYPES = Object.keys(TRIGGER_LABELS);
export const SELECTABLE_ACTION_TYPES = Object.keys(ACTION_LABELS).filter(
  (t) => t !== "MULTI_ACTION"
);

// ─── Icon & Color Mappings ───────────────────────────────────────────────────

export const TRIGGER_ICONS: Record<string, LucideIcon> = {
  NEW_RECORD: FilePlus,
  RECORD_CREATE: FilePlus,
  RECORD_FIELD_CHANGE: RefreshCw,
  TASK_STATUS_CHANGE: CheckSquare,
  TICKET_STATUS_CHANGE: AlertTriangle,
  MULTI_EVENT_DURATION: Layers,
  DIRECT_DIAL: Phone,
  VIEW_METRIC_THRESHOLD: Eye,
  TIME_SINCE_CREATION: Clock,
  SLA_BREACH: AlertTriangle,
  EVENT_TIME: Calendar,
  MANUAL: Play,
};

export const ACTION_ICONS: Record<string, LucideIcon> = {
  SEND_NOTIFICATION: Bell,
  CREATE_TASK: CheckSquare,
  UPDATE_RECORD_FIELD: RefreshCw,
  SEND_WHATSAPP: MessageSquare,
  WEBHOOK: Globe,
  ADD_TO_NURTURE_LIST: ListPlus,
  CREATE_RECORD: FilePlus,
  CREATE_CALENDAR_EVENT: Calendar,
  CALCULATE_DURATION: Timer,
  CALCULATE_MULTI_EVENT_DURATION: Calculator,
  MULTI_ACTION: Layers,
};

export const TRIGGER_COLORS: Record<string, string> = {
  NEW_RECORD: "border-blue-400",
  RECORD_CREATE: "border-blue-400",
  RECORD_FIELD_CHANGE: "border-purple-400",
  TASK_STATUS_CHANGE: "border-indigo-400",
  TICKET_STATUS_CHANGE: "border-orange-400",
  MULTI_EVENT_DURATION: "border-amber-400",
  DIRECT_DIAL: "border-cyan-400",
  VIEW_METRIC_THRESHOLD: "border-violet-400",
  TIME_SINCE_CREATION: "border-sky-400",
  SLA_BREACH: "border-red-400",
  EVENT_TIME: "border-teal-400",
  MANUAL: "border-gray-400",
};

export const ACTION_COLORS: Record<string, string> = {
  SEND_NOTIFICATION: "border-green-400",
  CREATE_TASK: "border-emerald-400",
  UPDATE_RECORD_FIELD: "border-lime-400",
  SEND_WHATSAPP: "border-green-500",
  WEBHOOK: "border-teal-400",
  ADD_TO_NURTURE_LIST: "border-cyan-400",
  CREATE_RECORD: "border-green-400",
  CREATE_CALENDAR_EVENT: "border-emerald-400",
  CALCULATE_DURATION: "border-green-400",
  CALCULATE_MULTI_EVENT_DURATION: "border-green-400",
  MULTI_ACTION: "border-green-400",
};

// ─── Field Definitions per Step Type ─────────────────────────────────────────

const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "לביצוע" },
  { value: "in_progress", label: "בתהליך" },
  { value: "waiting_client", label: "ממתין ללקוח" },
  { value: "on_hold", label: "בהמתנה" },
  { value: "completed_month", label: "הושלם החודש" },
  { value: "done", label: "הושלם" },
];

const TICKET_STATUS_OPTIONS = [
  { value: "OPEN", label: "פתוח" },
  { value: "IN_PROGRESS", label: "בטיפול" },
  { value: "WAITING_CLIENT", label: "ממתין ללקוח" },
  { value: "RESOLVED", label: "נפתר" },
  { value: "CLOSED", label: "סגור" },
];

const TIME_UNIT_OPTIONS = [
  { value: "minutes", label: "דקות" },
  { value: "hours", label: "שעות" },
  { value: "days", label: "ימים" },
];

const OPERATOR_OPTIONS = [
  { value: "lt", label: "< קטן מ" },
  { value: "lte", label: "<= קטן שווה" },
  { value: "gt", label: "> גדול מ" },
  { value: "gte", label: ">= גדול שווה" },
  { value: "eq", label: "= שווה ל" },
  { value: "neq", label: "!= שונה מ" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "נמוכה" },
  { value: "medium", label: "בינונית" },
  { value: "high", label: "גבוהה" },
];

const HTTP_METHOD_OPTIONS = [
  { value: "POST", label: "POST" },
  { value: "GET", label: "GET" },
];

const DIRECTION_OPTIONS = [
  { value: "before", label: "לפני" },
  { value: "after", label: "אחרי" },
];

const BREACH_TYPE_OPTIONS = [
  { value: "response", label: "תגובה" },
  { value: "resolution", label: "פתרון" },
];

export const TRIGGER_FIELD_CONFIGS: Record<string, FieldConfig[]> = {
  NEW_RECORD: [
    { key: "tableId", label: "טבלה", inputType: "table-select" },
  ],
  RECORD_CREATE: [
    { key: "tableId", label: "טבלה", inputType: "table-select" },
  ],
  RECORD_FIELD_CHANGE: [
    { key: "tableId", label: "טבלה", inputType: "table-select" },
    { key: "columnId", label: "עמודה", inputType: "column-select" },
    { key: "fromValue", label: "מערך", inputType: "column-value", placeholder: "השאר ריק לכל ערך", optional: true },
    { key: "toValue", label: "לערך", inputType: "column-value", placeholder: "השאר ריק לכל ערך", optional: true },
  ],
  TASK_STATUS_CHANGE: [
    { key: "fromStatus", label: "מסטטוס", inputType: "select", options: TASK_STATUS_OPTIONS, optional: true },
    { key: "toStatus", label: "לסטטוס", inputType: "select", options: TASK_STATUS_OPTIONS, optional: true },
  ],
  TICKET_STATUS_CHANGE: [
    { key: "fromStatus", label: "מסטטוס", inputType: "select", options: TICKET_STATUS_OPTIONS, optional: true },
    { key: "toStatus", label: "לסטטוס", inputType: "select", options: TICKET_STATUS_OPTIONS, optional: true },
  ],
  DIRECT_DIAL: [
    { key: "tableId", label: "טבלה", inputType: "table-select" },
    { key: "columnId", label: "שדה טלפון", inputType: "column-select" },
  ],
  TIME_SINCE_CREATION: [
    { key: "tableId", label: "טבלה", inputType: "table-select" },
    { key: "duration", label: "משך זמן", inputType: "number", placeholder: "5" },
    { key: "unit", label: "יחידה", inputType: "select", options: TIME_UNIT_OPTIONS },
  ],
  VIEW_METRIC_THRESHOLD: [
    { key: "viewId", label: "מזהה תצוגה", inputType: "number", placeholder: "1" },
    { key: "operator", label: "אופרטור", inputType: "select", options: OPERATOR_OPTIONS },
    { key: "threshold", label: "סף", inputType: "number", placeholder: "100" },
  ],
  EVENT_TIME: [
    { key: "offsetMinutes", label: "דקות", inputType: "number", placeholder: "30" },
    { key: "offsetDirection", label: "כיוון", inputType: "select", options: DIRECTION_OPTIONS },
  ],
  MANUAL: [
    { key: "tableId", label: "טבלה (אופציונלי)", inputType: "table-select", optional: true },
  ],
  MULTI_EVENT_DURATION: [],  // Complex config — read-only JSON, editable via AI chat
  SLA_BREACH: [
    { key: "breachType", label: "סוג הפרה", inputType: "select", options: BREACH_TYPE_OPTIONS },
  ],
};

export const ACTION_FIELD_CONFIGS: Record<string, FieldConfig[]> = {
  SEND_NOTIFICATION: [
    { key: "recipientId", label: "נמען", inputType: "user-select" },
    { key: "title", label: "כותרת", inputType: "text", placeholder: "כותרת ההתראה" },
    { key: "message", label: "הודעה", inputType: "textarea", placeholder: "תוכן ההודעה..." },
  ],
  CREATE_TASK: [
    { key: "title", label: "כותרת", inputType: "text", placeholder: "כותרת המשימה" },
    { key: "description", label: "תיאור", inputType: "textarea", placeholder: "תיאור המשימה...", optional: true },
    { key: "assigneeId", label: "אחראי", inputType: "user-select" },
    { key: "priority", label: "עדיפות", inputType: "select", options: PRIORITY_OPTIONS },
    { key: "status", label: "סטטוס", inputType: "select", options: TASK_STATUS_OPTIONS, optional: true },
    { key: "dueDays", label: "ימים ליעד", inputType: "number", placeholder: "7" },
  ],
  UPDATE_RECORD_FIELD: [
    { key: "columnId", label: "עמודה", inputType: "column-select" },
    { key: "value", label: "ערך", inputType: "column-value", placeholder: "הערך החדש" },
  ],
  SEND_WHATSAPP: [
    { key: "phoneColumnId", label: "יעד שליחה", inputType: "whatsapp-phone" },
    { key: "content", label: "תוכן ההודעה", inputType: "textarea", placeholder: "תוכן הודעת הוואטסאפ..." },
    { key: "delay", label: "השהייה (שניות)", inputType: "number", placeholder: "0", optional: true },
  ],
  WEBHOOK: [
    { key: "url", label: "URL", inputType: "text", placeholder: "https://..." },
    { key: "method", label: "Method", inputType: "select", options: HTTP_METHOD_OPTIONS },
  ],
  ADD_TO_NURTURE_LIST: [
    { key: "listId", label: "רשימה (slug)", inputType: "text", placeholder: "my-list" },
    { key: "mapping.name", label: "שדה שם", inputType: "column-select", optional: true },
    { key: "mapping.email", label: "שדה אימייל", inputType: "column-select", optional: true },
    { key: "mapping.phone", label: "שדה טלפון", inputType: "column-select", optional: true },
  ],
  CREATE_RECORD: [
    { key: "tableId", label: "טבלת יעד", inputType: "table-select" },
  ],
  CREATE_CALENDAR_EVENT: [
    { key: "title", label: "כותרת", inputType: "text", placeholder: "כותרת האירוע" },
    { key: "description", label: "תיאור", inputType: "textarea", placeholder: "תיאור האירוע...", optional: true },
    { key: "startOffset", label: "התחלה (offset)", inputType: "number", placeholder: "0" },
    { key: "endOffset", label: "סיום (offset)", inputType: "number", placeholder: "60" },
    { key: "startOffsetUnit", label: "יחידת התחלה", inputType: "select", options: TIME_UNIT_OPTIONS },
    { key: "endOffsetUnit", label: "יחידת סיום", inputType: "select", options: TIME_UNIT_OPTIONS },
  ],
  CALCULATE_DURATION: [
    { key: "fromField", label: "משדה", inputType: "text", placeholder: "fld_..." },
    { key: "toField", label: "לשדה", inputType: "text", placeholder: "fld_..." },
  ],
  CALCULATE_MULTI_EVENT_DURATION: [],
  MULTI_ACTION: [], // Handled by expanding into individual action steps
};

// ─── Schema ↔ Steps Converters ───────────────────────────────────────────────

let stepCounter = 0;
function nextStepId(): string {
  return `step_${++stepCounter}_${Date.now()}`;
}

export function schemaToSteps(schema: AutomationSchema): FlowStep[] {
  const steps: FlowStep[] = [];

  // Trigger step
  steps.push({
    id: nextStepId(),
    kind: "trigger",
    type: schema.triggerType,
    config: schema.triggerConfig || {},
    label: TRIGGER_LABELS[schema.triggerType] || schema.triggerType,
  });

  // Action steps — expand MULTI_ACTION into individual steps
  if (schema.actionType === "MULTI_ACTION" && Array.isArray(schema.actionConfig?.actions)) {
    for (const action of schema.actionConfig.actions) {
      steps.push({
        id: nextStepId(),
        kind: "action",
        type: action.type,
        config: action.config || {},
        label: ACTION_LABELS[action.type] || action.type,
      });
    }
  } else {
    steps.push({
      id: nextStepId(),
      kind: "action",
      type: schema.actionType,
      config: schema.actionConfig || {},
      label: ACTION_LABELS[schema.actionType] || schema.actionType,
    });
  }

  return steps;
}

export function stepsToSchema(
  name: string,
  description: string | undefined,
  steps: FlowStep[]
): AutomationSchema {
  const trigger = steps.find((s) => s.kind === "trigger");
  const actions = steps.filter((s) => s.kind === "action");

  if (!trigger || actions.length === 0) {
    throw new Error("Schema must have at least one trigger and one action");
  }

  if (actions.length === 1) {
    return {
      name,
      description,
      triggerType: trigger.type,
      triggerConfig: trigger.config,
      actionType: actions[0].type,
      actionConfig: actions[0].config,
    };
  }

  // Multiple actions → wrap in MULTI_ACTION
  return {
    name,
    description,
    triggerType: trigger.type,
    triggerConfig: trigger.config,
    actionType: "MULTI_ACTION",
    actionConfig: {
      actions: actions.map((a) => ({ type: a.type, config: a.config })),
    },
  };
}

// ─── Helper: get nested value from config ────────────────────────────────────

export function getNestedValue(config: Record<string, any>, key: string): any {
  const parts = key.split(".");
  let val: any = config;
  for (const part of parts) {
    if (val == null || typeof val !== "object") return undefined;
    val = val[part];
  }
  return val;
}

export function setNestedValue(config: Record<string, any>, key: string, value: any): Record<string, any> {
  const parts = key.split(".");
  const result = { ...config };
  if (parts.length === 1) {
    result[key] = value;
    return result;
  }
  // Deep clone the nested path
  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = { ...(current[parts[i]] || {}) };
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
  return result;
}
