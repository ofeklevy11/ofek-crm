/**
 * Centralized plan-based limits for automations.
 * This file must NOT import any server-only modules (used in frontend too).
 */

// --- Per-Category AutomationRule Limits (rule count) ---
export const AUTOMATION_CATEGORY_LIMITS: Record<string, number> = {
  basic: 2,
  premium: 6,
  super: Infinity,
};

// --- Actions-Per-Automation Limits (actions inside MULTI_ACTION) ---
export const ACTIONS_PER_AUTOMATION_LIMITS: Record<string, number> = {
  basic: 2,
  premium: 6,
  super: Infinity,
};

// --- Safety caps ---
export const MAX_RULES_PER_COMPANY = 500;
export const MAX_PER_MEETING_AUTOMATIONS = 10;

// --- Helpers ---

export function getAutomationCategoryLimit(tier: string | null | undefined): number {
  return AUTOMATION_CATEGORY_LIMITS[tier || "basic"] ?? AUTOMATION_CATEGORY_LIMITS.basic;
}

export function getActionsPerAutomationLimit(tier: string | null | undefined): number {
  return ACTIONS_PER_AUTOMATION_LIMITS[tier || "basic"] ?? ACTIONS_PER_AUTOMATION_LIMITS.basic;
}

// --- Trigger type categorization ---

export const MEETING_TRIGGER_TYPES = ["MEETING_BOOKED", "MEETING_CANCELLED", "MEETING_REMINDER"] as const;
export const EVENT_TRIGGER_TYPES = ["EVENT_TIME"] as const;

export const GENERAL_TRIGGER_TYPES = [
  "TASK_STATUS_CHANGE",
  "RECORD_CREATE",
  "NEW_RECORD",
  "RECORD_FIELD_CHANGE",
  "TIME_SINCE_CREATION",
  "DIRECT_DIAL",
  "MANUAL",
  "MULTI_EVENT_DURATION",
  "TICKET_STATUS_CHANGE",
  "SLA_BREACH",
  "VIEW_METRIC_THRESHOLD",
] as const;

export type AutomationCategory = "general" | "meeting" | "event";

const TRIGGER_TO_CATEGORY = new Map<string, AutomationCategory>();
for (const t of GENERAL_TRIGGER_TYPES) TRIGGER_TO_CATEGORY.set(t, "general");
for (const t of MEETING_TRIGGER_TYPES) TRIGGER_TO_CATEGORY.set(t, "meeting");
for (const t of EVENT_TRIGGER_TYPES) TRIGGER_TO_CATEGORY.set(t, "event");

export function getCategoryForTriggerType(triggerType: string): AutomationCategory {
  return TRIGGER_TO_CATEGORY.get(triggerType) ?? "general";
}

export function getTriggerTypesForCategory(category: AutomationCategory): string[] {
  switch (category) {
    case "meeting": return [...MEETING_TRIGGER_TYPES];
    case "event": return [...EVENT_TRIGGER_TYPES];
    case "general": return [...GENERAL_TRIGGER_TYPES];
  }
}
