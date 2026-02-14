import { redis } from "@/lib/redis";
import { NextResponse } from "next/server";

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
 * Returns null if under limit, or a 429 NextResponse if exceeded.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<NextResponse | null> {
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
} as const;
