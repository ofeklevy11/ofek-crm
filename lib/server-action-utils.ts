import { redis } from "@/lib/redis";
import { isPrivateUrl } from "@/lib/security/ssrf";

// ==========================================
// RATE LIMITING
// ==========================================

interface ActionRateLimitConfig {
  prefix: string;
  max: number;
  windowSeconds: number;
}

/** In-memory fallback counters when Redis is unavailable */
const inMemoryCounters = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for server actions. Throws if exceeded.
 * Falls back to in-memory rate limiting if Redis is down.
 */
export async function checkServerActionRateLimit(
  identifier: string,
  config: ActionRateLimitConfig,
): Promise<void> {
  try {
    const key = `rl:${config.prefix}:${identifier}`;
    const results = await redis
      .multi()
      .incr(key)
      .expire(key, config.windowSeconds)
      .exec();

    const count = results?.[0]?.[1] as number | undefined;
    if (count && count > config.max) {
      throw new Error("בוצעו יותר מדי פניות. אנא המתינו ונסו שוב");
    }
  } catch (e: any) {
    if (e?.message === "בוצעו יותר מדי פניות. אנא המתינו ונסו שוב") throw e;
    // Redis down — fall back to in-memory limiting
    const key = `rl:${config.prefix}:${identifier}`;
    const now = Date.now();
    const entry = inMemoryCounters.get(key);
    if (entry && entry.resetAt > now) {
      entry.count++;
      if (entry.count > config.max) {
        throw new Error("בוצעו יותר מדי פניות. אנא המתינו ונסו שוב");
      }
    } else {
      inMemoryCounters.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 });
    }
  }
}

export const WORKER_RATE_LIMITS = {
  read: { prefix: "wrk-read", max: 60, windowSeconds: 60 } satisfies ActionRateLimitConfig,
  mutation: { prefix: "wrk-mut", max: 30, windowSeconds: 60 } satisfies ActionRateLimitConfig,
  dangerous: { prefix: "wrk-del", max: 10, windowSeconds: 60 } satisfies ActionRateLimitConfig,
} as const;

// ==========================================
// STRING VALIDATION
// ==========================================

/**
 * Trim and validate string length. Returns trimmed value.
 * Throws if value exceeds maxLen.
 */
export function validateStringLength(
  value: string | undefined | null,
  maxLen: number,
  label: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("הערך שהוזן אינו תקין");
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw new Error(`הטקסט ארוך מדי, מותר עד ${maxLen} תווים`);
  }
  return trimmed;
}

/** Common max lengths for reuse */
export const MAX_LENGTHS = {
  name: 200,
  title: 200,
  description: 5000,
  notes: 5000,
  email: 320,
  phone: 50,
  color: 20,
  icon: 100,
  url: 2000,
  employeeId: 100,
  position: 200,
  feedback: 5000,
  avatar: 2000,
  resourceType: 100,
} as const;

// ==========================================
// JSON VALIDATION
// ==========================================

/**
 * Validate a JSON value for safe storage: max depth, max serialized size,
 * and strip prototype-pollution keys.
 */
export function validateJsonValue(
  value: unknown,
  maxDepth: number,
  maxSizeBytes: number,
  label: string,
): unknown {
  if (value === undefined || value === null) return value;

  // Size check
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("הנתונים שהוזנו אינם תקינים");
  }
  if (serialized.length > maxSizeBytes) {
    throw new Error(`הנתונים חורגים מהגודל המרבי המותר (${Math.round(maxSizeBytes / 1024)}KB)`);
  }

  // Depth check
  if (exceedsDepth(value, maxDepth)) {
    throw new Error("מבנה הנתונים מורכב מדי");
  }

  // Strip dangerous keys and return
  return stripDangerousKeys(value);
}

function exceedsDepth(value: unknown, max: number, current = 0): boolean {
  if (current > max) return true;
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => exceedsDepth(item, max, current + 1));
  }
  return Object.values(value).some((v) => exceedsDepth(v, max, current + 1));
}

function stripDangerousKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripDangerousKeys);

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    result[k] = stripDangerousKeys(v);
  }
  return result;
}

// ==========================================
// ON-COMPLETE ACTIONS VALIDATION
// ==========================================

const VALID_ON_COMPLETE_ACTION_TYPES = new Set([
  "UPDATE_RECORD",
  "CREATE_RECORD",
  "CREATE_TASK",
  "UPDATE_TASK",
  "CREATE_FINANCE",
  "SEND_NOTIFICATION",
  "SEND_WHATSAPP",
  "SEND_SMS",
  "WEBHOOK",
  "CREATE_CALENDAR_EVENT",
]);

const MAX_ON_COMPLETE_ACTIONS = 20;

/**
 * Validate onCompleteActions array for onboarding steps.
 * Returns sanitized array.
 */
export function validateOnCompleteActions(
  actions: unknown,
): Array<{ actionType: string; config: Record<string, unknown> }> | undefined {
  if (actions === undefined || actions === null) return undefined;
  if (!Array.isArray(actions)) throw new Error("onCompleteActions must be an array");
  if (actions.length > MAX_ON_COMPLETE_ACTIONS) {
    throw new Error(`onCompleteActions can have at most ${MAX_ON_COMPLETE_ACTIONS} items`);
  }

  const serialized = JSON.stringify(actions);
  if (serialized.length > 51200) {
    throw new Error("onCompleteActions total size exceeds 50KB limit");
  }

  return actions.map((action, i) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      throw new Error(`onCompleteActions[${i}] must be an object`);
    }
    const { actionType, config } = action as Record<string, unknown>;
    if (!actionType || typeof actionType !== "string") {
      throw new Error(`onCompleteActions[${i}].actionType is required`);
    }
    if (!VALID_ON_COMPLETE_ACTION_TYPES.has(actionType)) {
      throw new Error(`onCompleteActions[${i}].actionType "${actionType}" is invalid`);
    }
    if (config !== undefined && config !== null) {
      if (typeof config !== "object" || Array.isArray(config)) {
        throw new Error(`onCompleteActions[${i}].config must be an object`);
      }
      if (exceedsDepth(config, 3)) {
        throw new Error(`onCompleteActions[${i}].config is too deeply nested`);
      }
    }
    return {
      actionType,
      config: (config ? stripDangerousKeys(config) : {}) as Record<string, unknown>,
    };
  });
}

// ==========================================
// URL VALIDATION
// ==========================================

/**
 * Validate a URL: http/https only, max 2000 chars.
 * Rejects javascript: and other dangerous schemes.
 */
export function validateUrl(value: string | undefined | null, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("הערך שהוזן אינו תקין");
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_LENGTHS.url) {
    throw new Error(`כתובת ה-URL ארוכה מדי, מותר עד ${MAX_LENGTHS.url} תווים`);
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("כתובת ה-URL חייבת להשתמש ב-http או https");
    }
  } catch (e: any) {
    if (e?.message?.includes("חייבת להשתמש")) throw e;
    throw new Error("כתובת ה-URL אינה תקינה");
  }
  return trimmed;
}

/**
 * Validate a webhook URL: HTTPS only, rejects localhost/private IPs/metadata.
 */
export function validateWebhookUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) throw new Error("יש להזין כתובת Webhook");
  if (trimmed.length > MAX_LENGTHS.url) {
    throw new Error(`כתובת ה-Webhook ארוכה מדי, מותר עד ${MAX_LENGTHS.url} תווים`);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      throw new Error("כתובת ה-Webhook חייבת להשתמש ב-HTTPS");
    }
  } catch (e: any) {
    if (e?.message?.includes("חייבת להשתמש")) throw e;
    throw new Error("כתובת ה-Webhook אינה תקינה");
  }
  if (isPrivateUrl(trimmed)) {
    throw new Error("כתובת ה-Webhook אינה יכולה להפנות לכתובות פרטיות");
  }
  return trimmed;
}

// ==========================================
// NUMERIC VALIDATION
// ==========================================

export function validateNonNegativeInt(value: number | undefined, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("הערך חייב להיות מספר חיובי");
  }
  return Math.floor(value);
}

// ==========================================
// ERROR WRAPPING
// ==========================================

/**
 * Map Prisma error codes to user-facing messages.
 * Prevents leaking schema details.
 */
export function wrapPrismaError(e: any, context: string): never {
  if (e?.code === "P2025") {
    throw new Error("הפריט המבוקש לא נמצא");
  }
  if (e?.code === "P2002") {
    throw new Error("פריט עם פרטים אלו כבר קיים במערכת");
  }
  if (e?.code === "P2003") {
    throw new Error("לא ניתן למחוק פריט זה כיוון שקיימים פריטים הקשורים אליו");
  }
  // Already a user-facing error (no Prisma code) — rethrow as-is
  if (!e?.code?.startsWith?.("P")) {
    throw e;
  }
  // Unknown Prisma error — generic message
  throw new Error("אירעה שגיאה בעיבוד הבקשה. אנא נסו שוב");
}
