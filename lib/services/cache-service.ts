import { redis } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("CacheService");

/**
 * Build the full Redis cache key for a company-scoped metric.
 * Exported so callers can invalidate specific keys.
 */
export function buildCacheKey(companyId: number, keyParts: string[]): string {
  return `cache:metric:${companyId}:${keyParts.join(":")}`;
}

/**
 * Retrieves a cached metric or calculates it if missing/stale.
 * Uses Redis instead of PostgreSQL to free up DB connections.
 * companyId is required to enforce tenant isolation in cache keys.
 *
 * Strategy:
 * 1. Try to read from Redis cache (cheap, no DB connection).
 * 2. If valid, return immediately.
 * 3. If missing or stale:
 *    a. Try to acquire a distributed lock (SETNX) to prevent thundering herd.
 *    b. If lock acquired, compute the value and cache it.
 *    c. If lock not acquired (another worker is computing), return stale data
 *       or wait briefly and retry.
 *    d. If computation fails and stale data exists, return stale data.
 */
export async function getCachedMetric<T>(
  companyId: number,
  keyParts: string[],
  fetcher: () => Promise<T>,
  ttlSeconds: number = 4 * 60 * 60, // Default: 4 hours
): Promise<T> {
  const key = `${companyId}:${keyParts.join(":")}`;
  const cacheKey = `cache:metric:${key}`;
  const lockKey = `cache:lock:${key}`;

  // 1. Check Redis cache
  let cached: string | null = null;
  try {
    cached = await redis.get(cacheKey);
  } catch {
    // Redis down — fall through to compute
  }

  if (cached) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // Corrupted cache — treat as miss
    }
  }

  // 2. Try to acquire distributed lock (120s expiry to prevent deadlocks — long enough for slow fetchers)
  let lockAcquired = false;
  try {
    const result = await redis.set(lockKey, "1", "EX", 120, "NX");
    lockAcquired = result === "OK";
  } catch {
    // Redis down — proceed without lock (allow redundant computation)
    lockAcquired = true;
  }

  if (!lockAcquired) {
    // Another worker is computing. If we have stale data, return it.
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // fall through
      }
    }
    // No stale data: wait briefly and retry once
    await new Promise((r) => setTimeout(r, 500));
    try {
      const retry = await redis.get(cacheKey);
      if (retry) return JSON.parse(retry) as T;
    } catch {
      // fall through
    }
  }

  // 3. Compute new value (outside any DB transaction/lock)
  let newValue: T;
  try {
    newValue = await fetcher();
  } catch (error) {
    // Release lock on failure
    try { await redis.del(lockKey); } catch {}
    // Fallback: return stale data if available
    if (cached) {
      log.warn("Cache refresh failed, returning stale data", { key, error: String(error) });
      try {
        return JSON.parse(cached) as T;
      } catch {
        // fall through
      }
    }
    throw error;
  }

  // 4. Store in Redis and release lock
  try {
    await redis.set(cacheKey, JSON.stringify(newValue), "EX", ttlSeconds);
  } catch {
    // Cache write failure is non-fatal — we still have the computed value
    log.warn("Cache write to Redis failed", { key });
  }
  try { await redis.del(lockKey); } catch {}

  return newValue;
}
