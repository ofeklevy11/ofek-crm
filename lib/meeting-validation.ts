// --- Limits ---
export const MAX_NAME_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_SLUG_LENGTH = 100;
export const MAX_MEETING_TYPES_PER_COMPANY = 50;
export const MAX_MEETINGS_PER_COMPANY = 50_000;
export const MAX_CUSTOM_FIELDS = 20;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 50;
export const MAX_NOTES_LENGTH = 5000;
export const MAX_CANCEL_REASON_LENGTH = 1000;

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s\-+().]{7,20}$/;

interface ValidationOk<T> { valid: true; data: T }
interface ValidationErr { valid: false; error: string }

export type MeetingTypeInput = {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  duration?: unknown;
  color?: unknown;
  bufferBefore?: unknown;
  bufferAfter?: unknown;
  dailyLimit?: unknown;
  minAdvanceHours?: unknown;
  maxAdvanceDays?: unknown;
  customFields?: unknown;
  availabilityOverride?: unknown;
  isActive?: unknown;
  order?: unknown;
};

export interface ValidatedMeetingType {
  name: string;
  slug: string;
  description?: string;
  duration: number;
  color?: string;
  bufferBefore: number;
  bufferAfter: number;
  dailyLimit?: number;
  minAdvanceHours: number;
  maxAdvanceDays: number;
  customFields: unknown[];
  availabilityOverride?: unknown;
  isActive: boolean;
  order: number;
}

export function validateMeetingTypeInput(
  input: MeetingTypeInput,
  requireAll = true,
): ValidationOk<Partial<ValidatedMeetingType>> | ValidationErr {
  const data: Partial<ValidatedMeetingType> = {};

  // Name
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim().length === 0) {
      return { valid: false, error: "שם סוג הפגישה נדרש" };
    }
    if (input.name.trim().length > MAX_NAME_LENGTH) {
      return { valid: false, error: `שם לא יכול לעלות על ${MAX_NAME_LENGTH} תווים` };
    }
    data.name = input.name.trim();
  } else if (requireAll) {
    return { valid: false, error: "שם סוג הפגישה נדרש" };
  }

  // Slug
  if (input.slug !== undefined) {
    if (typeof input.slug !== "string" || !SLUG_REGEX.test(input.slug)) {
      return { valid: false, error: "slug חייב להיות באותיות אנגליות קטנות ומקפים בלבד" };
    }
    if (input.slug.length > MAX_SLUG_LENGTH) {
      return { valid: false, error: `slug לא יכול לעלות על ${MAX_SLUG_LENGTH} תווים` };
    }
    data.slug = input.slug;
  } else if (requireAll) {
    return { valid: false, error: "slug נדרש" };
  }

  // Description
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== "string") {
      return { valid: false, error: "תיאור חייב להיות טקסט" };
    }
    if (input.description.length > MAX_DESCRIPTION_LENGTH) {
      return { valid: false, error: `תיאור לא יכול לעלות על ${MAX_DESCRIPTION_LENGTH} תווים` };
    }
    data.description = input.description.trim();
  }

  // Duration
  if (input.duration !== undefined) {
    const d = Number(input.duration);
    if (!Number.isInteger(d) || d < 5 || d > 480) {
      return { valid: false, error: "משך הפגישה חייב להיות בין 5 ל-480 דקות" };
    }
    data.duration = d;
  } else if (requireAll) {
    return { valid: false, error: "משך הפגישה נדרש" };
  }

  // Color
  if (input.color !== undefined && input.color !== null) {
    if (typeof input.color !== "string") {
      return { valid: false, error: "צבע חייב להיות טקסט" };
    }
    data.color = input.color.trim();
  }

  // Buffers
  if (input.bufferBefore !== undefined) {
    const b = Number(input.bufferBefore);
    if (!Number.isInteger(b) || b < 0 || b > 120) {
      return { valid: false, error: "זמן חציצה לפני חייב להיות בין 0 ל-120 דקות" };
    }
    data.bufferBefore = b;
  }
  if (input.bufferAfter !== undefined) {
    const b = Number(input.bufferAfter);
    if (!Number.isInteger(b) || b < 0 || b > 120) {
      return { valid: false, error: "זמן חציצה אחרי חייב להיות בין 0 ל-120 דקות" };
    }
    data.bufferAfter = b;
  }

  // Daily limit
  if (input.dailyLimit !== undefined && input.dailyLimit !== null) {
    const l = Number(input.dailyLimit);
    if (!Number.isInteger(l) || l < 1 || l > 100) {
      return { valid: false, error: "מגבלה יומית חייבת להיות בין 1 ל-100" };
    }
    data.dailyLimit = l;
  }

  // Advance hours
  if (input.minAdvanceHours !== undefined) {
    const h = Number(input.minAdvanceHours);
    if (!Number.isInteger(h) || h < 0 || h > 720) {
      return { valid: false, error: "זמן מינימלי מראש חייב להיות בין 0 ל-720 שעות" };
    }
    data.minAdvanceHours = h;
  }

  // Max advance days
  if (input.maxAdvanceDays !== undefined) {
    const d = Number(input.maxAdvanceDays);
    if (!Number.isInteger(d) || d < 1 || d > 365) {
      return { valid: false, error: "ימי הזמנה מקסימליים חייבים להיות בין 1 ל-365" };
    }
    data.maxAdvanceDays = d;
  }

  // Custom fields
  if (input.customFields !== undefined) {
    if (!Array.isArray(input.customFields)) {
      return { valid: false, error: "שדות מותאמים חייבים להיות מערך" };
    }
    if (input.customFields.length > MAX_CUSTOM_FIELDS) {
      return { valid: false, error: `מקסימום ${MAX_CUSTOM_FIELDS} שדות מותאמים` };
    }
    data.customFields = input.customFields;
  }

  // Availability override
  if (input.availabilityOverride !== undefined) {
    data.availabilityOverride = input.availabilityOverride;
  }

  // isActive
  if (input.isActive !== undefined) {
    data.isActive = !!input.isActive;
  }

  // Order
  if (input.order !== undefined) {
    const o = Number(input.order);
    if (!Number.isInteger(o) || o < 0) {
      return { valid: false, error: "סדר חייב להיות מספר חיובי" };
    }
    data.order = o;
  }

  return { valid: true, data };
}

export interface BookingInput {
  participantName?: unknown;
  participantEmail?: unknown;
  participantPhone?: unknown;
  startTime?: unknown;
  customFieldData?: unknown;
}

export interface ValidatedBooking {
  participantName: string;
  participantEmail?: string;
  participantPhone?: string;
  startTime: Date;
  customFieldData?: unknown;
}

export function validateBookingInput(
  input: BookingInput,
): ValidationOk<ValidatedBooking> | ValidationErr {
  // Name (required)
  if (!input.participantName || typeof input.participantName !== "string" || input.participantName.trim().length === 0) {
    return { valid: false, error: "שם המשתתף נדרש" };
  }
  if (input.participantName.trim().length > MAX_NAME_LENGTH) {
    return { valid: false, error: "שם ארוך מדי" };
  }

  // Email
  let email: string | undefined;
  if (input.participantEmail !== undefined && input.participantEmail !== null && input.participantEmail !== "") {
    if (typeof input.participantEmail !== "string" || !EMAIL_REGEX.test(input.participantEmail.trim())) {
      return { valid: false, error: "כתובת אימייל לא תקינה" };
    }
    email = input.participantEmail.trim().toLowerCase();
  }

  // Phone
  let phone: string | undefined;
  if (input.participantPhone !== undefined && input.participantPhone !== null && input.participantPhone !== "") {
    if (typeof input.participantPhone !== "string" || !PHONE_REGEX.test(input.participantPhone.trim())) {
      return { valid: false, error: "מספר טלפון לא תקין" };
    }
    phone = input.participantPhone.trim();
  }

  // Must have at least email or phone
  if (!email && !phone) {
    return { valid: false, error: "נדרש אימייל או טלפון" };
  }

  // Start time
  if (!input.startTime || typeof input.startTime !== "string") {
    return { valid: false, error: "שעת התחלה נדרשת" };
  }
  const startDate = new Date(input.startTime);
  if (isNaN(startDate.getTime())) {
    return { valid: false, error: "שעת התחלה לא תקינה" };
  }

  return {
    valid: true,
    data: {
      participantName: input.participantName.trim(),
      participantEmail: email,
      participantPhone: phone,
      startTime: startDate,
      customFieldData: input.customFieldData,
    },
  };
}

export function validateTags(tags: unknown): string[] | null {
  if (!Array.isArray(tags)) return null;
  if (tags.length > MAX_TAGS) return null;
  const result: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== "string") return null;
    const t = tag.trim();
    if (t.length === 0 || t.length > MAX_TAG_LENGTH) return null;
    result.push(t);
  }
  return result;
}

export function validateNotes(notes: unknown): string | null {
  if (notes === undefined || notes === null || notes === "") return "";
  if (typeof notes !== "string") return null;
  if (notes.length > MAX_NOTES_LENGTH) return null;
  return notes.trim();
}
