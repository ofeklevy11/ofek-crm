import { defaultEventColors } from "@/lib/types";

// --- Limits ---
export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_COLOR_LENGTH = 20;
export const MAX_EVENTS_PER_COMPANY = 10_000;
export const MAX_AUTOMATION_CONFIG_SIZE = 4_000; // bytes

// Allowed color values (hex codes from the UI palette + common named colors)
const ALLOWED_COLORS = new Set([
  ...defaultEventColors,
  // Named colors the webhook docs reference
  "blue", "red", "green", "yellow", "purple", "orange", "cyan", "pink",
]);

export interface CalendarEventInput {
  title?: unknown;
  description?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  color?: unknown;
}

interface ValidationResult {
  valid: true;
  data: {
    title: string;
    description: string | undefined;
    startTime: Date;
    endTime: Date;
    color: string | undefined;
  };
}

interface ValidationUpdateResult {
  valid: true;
  data: {
    title: string | undefined;
    description: string | undefined;
    startTime: Date | undefined;
    endTime: Date | undefined;
    color: string | undefined;
  };
}

interface ValidationError {
  valid: false;
  error: string;
}

/**
 * Validate and sanitize calendar event input.
 * Returns either a cleaned data object or an error message.
 */
export function validateCalendarEventInput(
  input: CalendarEventInput,
  requireAllFields: boolean = true
): ValidationResult | ValidationError {
  // --- Title ---
  if (requireAllFields && (input.title === undefined || input.title === null)) {
    return { valid: false, error: "Title is required" };
  }
  if (input.title !== undefined && input.title !== null) {
    if (typeof input.title !== "string") {
      return { valid: false, error: "Title must be a string" };
    }
    const trimmed = input.title.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: "Title cannot be empty" };
    }
    if (trimmed.length > MAX_TITLE_LENGTH) {
      return { valid: false, error: `Title cannot exceed ${MAX_TITLE_LENGTH} characters` };
    }
  }

  // --- Description ---
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== "string") {
      return { valid: false, error: "Description must be a string" };
    }
    if (input.description.length > MAX_DESCRIPTION_LENGTH) {
      return { valid: false, error: `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters` };
    }
  }

  // --- Dates ---
  if (requireAllFields && (!input.startTime || !input.endTime)) {
    return { valid: false, error: "startTime and endTime are required" };
  }

  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (input.startTime !== undefined && input.startTime !== null) {
    if (typeof input.startTime !== "string" && !(input.startTime instanceof Date)) {
      return { valid: false, error: "startTime must be a date string" };
    }
    startDate = new Date(input.startTime as string);
    if (isNaN(startDate.getTime())) {
      return { valid: false, error: "startTime is not a valid date" };
    }
    const startYear = startDate.getFullYear();
    if (startYear < 1970 || startYear > 2200) {
      return { valid: false, error: "startTime year must be between 1970 and 2200" };
    }
  }

  if (input.endTime !== undefined && input.endTime !== null) {
    if (typeof input.endTime !== "string" && !(input.endTime instanceof Date)) {
      return { valid: false, error: "endTime must be a date string" };
    }
    endDate = new Date(input.endTime as string);
    if (isNaN(endDate.getTime())) {
      return { valid: false, error: "endTime is not a valid date" };
    }
    const endYear = endDate.getFullYear();
    if (endYear < 1970 || endYear > 2200) {
      return { valid: false, error: "endTime year must be between 1970 and 2200" };
    }
  }

  if (startDate && endDate && endDate <= startDate) {
    return { valid: false, error: "endTime must be after startTime" };
  }

  // --- Color ---
  let sanitizedColor: string | undefined;
  if (input.color !== undefined && input.color !== null) {
    if (typeof input.color !== "string") {
      return { valid: false, error: "Color must be a string" };
    }
    const c = input.color.trim().toLowerCase();
    // Allow hex colors that match /^#[0-9a-f]{6}$/i or named colors from the whitelist
    const isValidHex = /^#[0-9a-f]{6}$/i.test(input.color.trim());
    if (!isValidHex && !ALLOWED_COLORS.has(c) && !ALLOWED_COLORS.has(input.color.trim())) {
      return { valid: false, error: "Invalid color value" };
    }
    sanitizedColor = input.color.trim();
  }

  if (requireAllFields && (!startDate || !endDate)) {
    return { valid: false, error: "startTime and endTime are required" };
  }

  return {
    valid: true,
    data: {
      title: typeof input.title === "string" ? input.title.trim() : (input.title as string),
      description: typeof input.description === "string" ? input.description.trim() : undefined,
      startTime: startDate!,
      endTime: endDate!,
      color: sanitizedColor,
    },
  };
}

/**
 * Validate partial update input (no required fields).
 */
export function validateCalendarEventUpdate(input: CalendarEventInput): ValidationUpdateResult | ValidationError {
  if ((input.startTime && !input.endTime) || (!input.startTime && input.endTime)) {
    return { valid: false, error: "Both startTime and endTime must be provided when updating times" };
  }
  return validateCalendarEventInput(input, false) as ValidationUpdateResult | ValidationError;
}

/**
 * Validate automation actionConfig size to prevent oversized JSON storage.
 */
export function validateActionConfigSize(config: unknown): boolean {
  try {
    const json = JSON.stringify(config);
    return json.length <= MAX_AUTOMATION_CONFIG_SIZE;
  } catch {
    return false;
  }
}
