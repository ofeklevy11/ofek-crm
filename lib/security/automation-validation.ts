/** @deprecated Use MAX_RULES_PER_COMPANY from @/lib/plan-limits instead */
export { MAX_RULES_PER_COMPANY } from "@/lib/plan-limits";

/** Maximum serialized size for triggerConfig/actionConfig (50KB) */
const MAX_CONFIG_SIZE = 50 * 1024;

/** Maximum nesting depth for config objects */
const MAX_CONFIG_DEPTH = 5;

/** Maximum name length */
const MAX_NAME_LENGTH = 200;

const VALID_TRIGGER_TYPES = new Set([
  "MANUAL",
  "TASK_STATUS_CHANGE",
  "RECORD_CREATE",
  "NEW_RECORD",
  "RECORD_FIELD_CHANGE",
  "MULTI_EVENT_DURATION",
  "DIRECT_DIAL",
  "VIEW_METRIC_THRESHOLD",
  "TIME_SINCE_CREATION",
  "TICKET_STATUS_CHANGE",
  "SLA_BREACH",
  "EVENT_TIME",
]);

const VALID_ACTION_TYPES = new Set([
  "SEND_NOTIFICATION",
  "CALCULATE_DURATION",
  "CALCULATE_MULTI_EVENT_DURATION",
  "UPDATE_RECORD_FIELD",
  "SEND_WHATSAPP",
  "WEBHOOK",
  "ADD_TO_NURTURE_LIST",
  "CREATE_TASK",
  "CREATE_RECORD",
  "CREATE_CALENDAR_EVENT",
  "MULTI_ACTION",
]);

/** Check nesting depth of an object/array. Returns true if depth exceeds max. */
function exceedsDepth(value: unknown, max: number, current = 0): boolean {
  if (current > max) return true;
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => exceedsDepth(item, max, current + 1));
  }
  return Object.values(value).some((v) => exceedsDepth(v, max, current + 1));
}

/**
 * Validate automation rule input data.
 * Returns null if valid, or an error string if invalid.
 */
export function validateAutomationInput(data: {
  name: string;
  triggerType: string;
  triggerConfig: unknown;
  actionType: string;
  actionConfig: unknown;
}): string | null {
  // Name validation
  if (!data.name || typeof data.name !== "string") {
    return "Name is required";
  }
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0) {
    return "Name cannot be empty";
  }
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return `Name must be ${MAX_NAME_LENGTH} characters or less`;
  }

  // Enum validation
  if (!VALID_TRIGGER_TYPES.has(data.triggerType)) {
    return "Invalid trigger type";
  }
  if (!VALID_ACTION_TYPES.has(data.actionType)) {
    return "Invalid action type";
  }

  // Config size validation
  try {
    const triggerStr = JSON.stringify(data.triggerConfig ?? {});
    if (triggerStr.length > MAX_CONFIG_SIZE) {
      return "Trigger configuration is too large";
    }
  } catch {
    return "Invalid trigger configuration";
  }

  try {
    const actionStr = JSON.stringify(data.actionConfig ?? {});
    if (actionStr.length > MAX_CONFIG_SIZE) {
      return "Action configuration is too large";
    }
  } catch {
    return "Invalid action configuration";
  }

  // Config depth validation
  if (exceedsDepth(data.triggerConfig, MAX_CONFIG_DEPTH)) {
    return "Trigger configuration is too deeply nested";
  }
  if (exceedsDepth(data.actionConfig, MAX_CONFIG_DEPTH)) {
    return "Action configuration is too deeply nested";
  }

  return null;
}

/**
 * Validate that an ID is a positive integer.
 * Returns null if valid, or an error string if invalid.
 */
export function validateId(id: unknown): string | null {
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return "Invalid ID";
  }
  return null;
}
