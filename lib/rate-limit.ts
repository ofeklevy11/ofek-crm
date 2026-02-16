import { redis } from "@/lib/redis";
import { checkMemoryRateLimit } from "@/lib/rate-limit-action";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("RateLimit");

interface RateLimitConfig {
  /** Redis key prefix for this limiter */
  prefix: string;
  /** Max requests allowed in the window */
  max: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/**
 * Check rate limit using Redis atomic INCR + EXPIRE.
 * Falls back to in-memory rate limiting when Redis is down (fail-closed).
 * Returns null if under limit, or a 429 NextResponse if exceeded.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  try {
    const key = `rl:${config.prefix}:${identifier}`;
    const results = await redis
      .multi()
      .incr(key)
      .expire(key, config.windowSeconds)
      .exec();

    const count = results?.[0]?.[1] as number | undefined;
    if (!count || count > config.max) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(config.windowSeconds),
          },
        }
      );
    }
    return null;
  } catch (err) {
    log.error("Redis error, falling back to in-memory", { error: String(err) });
    // Fail closed: use in-memory rate limiting instead of allowing all traffic
    const memKey = `rl:${config.prefix}:${identifier}`;
    if (checkMemoryRateLimit(memKey, config.max, config.windowSeconds)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(config.windowSeconds),
          },
        }
      );
    }
    return null;
  }
}

/**
 * Check rate limit for server actions (returns boolean instead of NextResponse).
 * Falls back to in-memory rate limiting when Redis is down (fail-closed).
 * Returns true if rate-limited (should reject), false if allowed.
 */
export async function checkActionRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<boolean> {
  try {
    const key = `rl:${config.prefix}:${identifier}`;
    const results = await redis
      .multi()
      .incr(key)
      .expire(key, config.windowSeconds)
      .exec();

    const count = results?.[0]?.[1] as number | undefined;
    return !count || count > config.max;
  } catch (err) {
    log.error("Redis error, falling back to in-memory", { error: String(err) });
    const memKey = `rl:${config.prefix}:${identifier}`;
    return checkMemoryRateLimit(memKey, config.max, config.windowSeconds);
  }
}

// Pre-configured rate limiters for common use cases
export const RATE_LIMITS = {
  /** SSE connections: 30 per user per minute (3 components × ~5 navigations) */
  sse: { prefix: "sse", max: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Webhook endpoints: 60 requests per company per minute */
  webhook: { prefix: "webhook", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Bulk operations: 5 per user per minute */
  bulk: { prefix: "bulk", max: 5, windowSeconds: 60 } satisfies RateLimitConfig,
  /** General API: 120 requests per user per minute */
  api: { prefix: "api", max: 120, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Login: 5 attempts per IP per 15 minutes */
  login: { prefix: "login", max: 5, windowSeconds: 900 } satisfies RateLimitConfig,
  /** Login per-account: 10 attempts per email per 30 minutes */
  loginAccount: { prefix: "login-acct", max: 10, windowSeconds: 1800 } satisfies RateLimitConfig,
  /** Registration: 3 per IP per 15 minutes */
  register: { prefix: "register", max: 3, windowSeconds: 900 } satisfies RateLimitConfig,
  /** Calendar mutations: 30 per user per minute */
  calendarMutation: { prefix: "cal-mut", max: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Calendar reads: 60 per user per minute */
  calendarRead: { prefix: "cal-read", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Workflow reads: 60 per user per minute */
  workflowRead: { prefix: "wf-read", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Workflow mutations: 30 per user per minute */
  workflowMutation: { prefix: "wf-mut", max: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Automation mutations: 30 per user per minute */
  automationMutate: { prefix: "auto-mut", max: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Automation reads: 60 per user per minute */
  automationRead: { prefix: "auto-read", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Product reads: 60 per user per minute */
  productRead: { prefix: "prod-read", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Product mutations: 20 per user per minute */
  productMutation: { prefix: "prod-mut", max: 20, windowSeconds: 60 } satisfies RateLimitConfig,
  /** User management mutations (create/delete): 10 per user per minute */
  userManagement: { prefix: "user-mgmt", max: 10, windowSeconds: 60 } satisfies RateLimitConfig,
  /** File reads (download, list): 60 per user per minute */
  fileRead: { prefix: "file-read", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** File mutations (create, rename, delete, move): 30 per user per minute */
  fileMutation: { prefix: "file-mut", max: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Chat sends (DM + group): 30 per user per minute */
  chatSend: { prefix: "chat-send", max: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Chat reads: 60 per user per minute */
  chatRead: { prefix: "chat-read", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Chat group create/update: 10 per user per minute */
  chatMutate: { prefix: "chat-mut", max: 10, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Chat markAsRead: 60 per user per minute */
  chatMark: { prefix: "chat-mark", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Quote reads: 60 per user per minute */
  quoteRead: { prefix: "qt-read", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Quote mutations: 20 per user per minute */
  quoteMutation: { prefix: "qt-mut", max: 20, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Public download: 20 per IP per minute */
  publicDownload: { prefix: "pub-dl", max: 20, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Goal reads: 60 per user per minute */
  goalRead: { prefix: "goal-read", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Goal mutations: 30 per user per minute */
  goalMutation: { prefix: "goal-mut", max: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Goal preview (expensive aggregate queries): 20 per user per minute */
  goalPreview: { prefix: "goal-prev", max: 20, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Service mutations: 30 per user per minute */
  serviceMutation: { prefix: "svc-mut", max: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Service reads: 60 per user per minute */
  serviceRead: { prefix: "svc-read", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Task reads: 60 per user per minute */
  taskRead: { prefix: "task-read", max: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Task mutations: 30 per user per minute */
  taskMutation: { prefix: "task-mut", max: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Finance mutations: 30 per user per minute */
  financeMutation: { prefix: "fin-mut", max: 30, windowSeconds: 60 } satisfies RateLimitConfig,
} as const;
