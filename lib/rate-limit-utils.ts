/**
 * Central rate-limit detection utilities.
 * Used across server components, client components, and the error boundary
 * to consistently detect and handle 429 / rate-limit errors.
 */

/** User-facing Hebrew rate-limit message — single source of truth. */
export const RATE_LIMIT_MESSAGE = "יותר מדי בקשות, נסה שוב בעוד 2 דקות";

const RATE_LIMIT_RE =
  /rate.?limit|too many requests|429|יותר מדי (פניות|בקשות|ניסיונות)/i;

/** Typed error so callers can `instanceof` check. */
export class RateLimitError extends Error {
  constructor(message = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Returns `true` when the value looks like a rate-limit error.
 * Accepts: Error instances, `{ success: false, error: string }` objects,
 * plain strings, or anything with a `.message` property.
 */
export function isRateLimitError(value: unknown): boolean {
  if (value instanceof RateLimitError) return true;

  if (value instanceof Error) {
    return RATE_LIMIT_RE.test(value.message);
  }

  if (typeof value === "string") {
    return RATE_LIMIT_RE.test(value);
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.error === "string" && RATE_LIMIT_RE.test(obj.error)) return true;
    if (typeof obj.message === "string" && RATE_LIMIT_RE.test(obj.message)) return true;
  }

  return false;
}

/**
 * Checks an array of server-action results.
 * If any result is a `{ success: false, error }` with a rate-limit message,
 * throws `RateLimitError` so the page can catch it uniformly.
 */
export function throwIfAnyRateLimited(...results: unknown[]): void {
  for (const r of results) {
    if (r && typeof r === "object" && "success" in (r as any)) {
      const obj = r as { success: boolean; error?: string };
      if (!obj.success && typeof obj.error === "string" && RATE_LIMIT_RE.test(obj.error)) {
        throw new RateLimitError(obj.error);
      }
    }
  }
}
