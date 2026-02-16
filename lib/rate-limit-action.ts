import { redis } from "@/lib/redis";

interface ActionRateLimitConfig {
  prefix: string;
  max: number;
  windowSeconds: number;
}

// In-memory sliding window fallback when Redis is unavailable
const MAX_MEMORY_RL_SIZE = 10000;
const memoryRL = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup of stale entries (every 60s)
let lastMemoryCleanup = 0;
function cleanupMemoryRL() {
  const now = Date.now();
  if (now - lastMemoryCleanup < 60_000) return;
  lastMemoryCleanup = now;
  for (const [key, entry] of memoryRL) {
    if (entry.resetAt < now) memoryRL.delete(key);
  }
}

function checkMemoryRateLimit(key: string, max: number, windowSec: number): boolean {
  cleanupMemoryRL();
  const now = Date.now();
  const entry = memoryRL.get(key);
  if (!entry || entry.resetAt < now) {
    // Fail closed if Map is too large to prevent cache exhaustion bypass
    if (memoryRL.size >= MAX_MEMORY_RL_SIZE) {
      return true;
    }
    memoryRL.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

/**
 * Check rate limit for server actions.
 * Returns { error: string } if rate-limited, null if allowed.
 * Falls back to in-memory rate limiting if Redis is down.
 */
export async function checkActionRateLimit(
  identifier: string,
  config: ActionRateLimitConfig,
): Promise<{ error: string } | null> {
  try {
    const key = `rl:${config.prefix}:${identifier}`;
    const results = await redis
      .multi()
      .incr(key)
      .expire(key, config.windowSeconds)
      .exec();

    const count = results?.[0]?.[1] as number | undefined;
    if (!count || count > config.max) {
      return { error: "Rate limit exceeded. Please try again later." };
    }
    return null;
  } catch {
    // Redis down — fall back to in-memory rate limiting
    const memKey = `rl:${config.prefix}:${identifier}`;
    if (checkMemoryRateLimit(memKey, config.max, config.windowSeconds)) {
      return { error: "Rate limit exceeded. Please try again later." };
    }
    return null;
  }
}

export const DASHBOARD_RATE_LIMITS = {
  /** Dashboard page SSR renders: 120 per user per minute (lightweight — just prevents flooding) */
  page: { prefix: "dash-page", max: 120, windowSeconds: 60 } satisfies ActionRateLimitConfig,
  /** Dashboard data reads: 60 per user per minute */
  read: { prefix: "dash-read", max: 60, windowSeconds: 60 } satisfies ActionRateLimitConfig,
  /** Dashboard mutations (add/update/remove widget): 20 per user per minute */
  write: { prefix: "dash-write", max: 20, windowSeconds: 60 } satisfies ActionRateLimitConfig,
  /** Batch data fetch: 10 per user per minute */
  batch: { prefix: "dash-batch", max: 10, windowSeconds: 60 } satisfies ActionRateLimitConfig,
  /** One-time migration: 3 per user per 10 minutes */
  migrate: { prefix: "dash-migrate", max: 3, windowSeconds: 600 } satisfies ActionRateLimitConfig,
} as const;

export const TABLE_RATE_LIMITS = {
  /** Table reads: 60 per user per minute */
  read: { prefix: "tbl-read", max: 60, windowSeconds: 60 } satisfies ActionRateLimitConfig,
} as const;

export const ANALYTICS_RATE_LIMITS = {
  /** Analytics data reads: 30 per user per minute */
  read: { prefix: "ana-read", max: 30, windowSeconds: 60 } satisfies ActionRateLimitConfig,
  /** Analytics mutations (create/update/delete/refresh): 15 per user per minute */
  mutation: { prefix: "ana-mut", max: 15, windowSeconds: 60 } satisfies ActionRateLimitConfig,
  /** Analytics UI updates (order/color): 20 per user per minute */
  uiUpdate: { prefix: "ana-ui", max: 20, windowSeconds: 60 } satisfies ActionRateLimitConfig,
  /** Analytics preview: 5 per user per 30 seconds */
  preview: { prefix: "ana-prev", max: 5, windowSeconds: 30 } satisfies ActionRateLimitConfig,
} as const;

export { checkMemoryRateLimit };
