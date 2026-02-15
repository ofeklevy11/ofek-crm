import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";

const GOALS_CACHE_FRESH_TTL = 30 * 60; // 30 minutes — considered "fresh"
const GOALS_CACHE_STALE_TTL = 60 * 60; // 60 minutes — max lifetime (stale served while revalidating)
const TABLE_WIDGET_CACHE_TTL = 15 * 60; // 15 minutes
const LOCK_TTL = 120; // 2 minutes — Inngest timeout (90s) + 30s buffer

// --- Key helpers ---

function goalsKey(companyId: number) {
  return `dashboard:${companyId}:goals`;
}

function tableWidgetKey(companyId: number, widgetHash: string) {
  return `dashboard:${companyId}:table-widget:${widgetHash}`;
}

function dashboardLockKey(companyId: number) {
  return `dashboard:${companyId}:refresh-lock`;
}

/**
 * Build a stable hash for a table widget request so we can cache it.
 * Uses tableId + viewId + sorted settings keys.
 */
export function buildWidgetHash(
  tableId: number,
  viewId: number | string,
  settings?: any,
): string {
  const parts = [tableId, viewId];
  if (settings) {
    // Include sorted columns + sort + limit for stable key
    if (settings.columns) parts.push(`cols|${[...settings.columns].sort().join(",")}`);
    if (settings.sort) parts.push(`s|${settings.sort}`);
    if (settings.sortBy) parts.push(`sb|${settings.sortBy}`);
    if (settings.limit) parts.push(`l|${settings.limit}`);
  }
  return parts.join("|");
}

// --- Goals cache (stale-while-revalidate) ---
// NOTE: Date objects (startDate, endDate, createdAt, updatedAt) are serialized to ISO strings
// by JSON.stringify. Frontend already handles this since Next.js server→client transfer does the same.
//
// Cache envelope: { data: any[], setAt: number }
// - If age < GOALS_CACHE_FRESH_TTL → return data (fresh)
// - If age >= FRESH but key still exists (< STALE_TTL) → return data + signal stale
// - If key expired → return null (cache miss)

function goalsTimestampKey(companyId: number) {
  return `dashboard:${companyId}:goals:ts`;
}

export async function getCachedGoals(
  companyId: number,
): Promise<{ data: any[]; stale: boolean } | null> {
  try {
    const [raw, tsRaw] = await redis.mget(goalsKey(companyId), goalsTimestampKey(companyId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    const setAt = tsRaw ? Number(tsRaw) : 0;
    const age = (Date.now() - setAt) / 1000;
    return { data, stale: age >= GOALS_CACHE_FRESH_TTL };
  } catch (err) {
    console.error("[dashboard-cache] Failed to read goals cache:", err);
    return null;
  }
}

export async function setCachedGoals(companyId: number, goals: any[]): Promise<void> {
  try {
    const pipeline = redis.pipeline();
    pipeline.set(goalsKey(companyId), JSON.stringify(goals), "EX", GOALS_CACHE_STALE_TTL);
    pipeline.set(goalsTimestampKey(companyId), String(Date.now()), "EX", GOALS_CACHE_STALE_TTL);
    await pipeline.exec();
  } catch (err) {
    console.error("[dashboard-cache] Failed to set goals cache:", err);
  }
}

export async function invalidateGoalsCache(companyId: number): Promise<void> {
  try {
    await redis.del(goalsKey(companyId), goalsTimestampKey(companyId));
  } catch (err) {
    console.error("[dashboard-cache] Failed to invalidate goals cache:", err);
  }
}

// --- Table widget cache ---

export async function getCachedTableWidget(
  companyId: number,
  widgetHash: string,
): Promise<any | null> {
  try {
    const raw = await redis.get(tableWidgetKey(companyId, widgetHash));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("[dashboard-cache] Failed to read table widget cache:", err);
    return null;
  }
}

export async function setCachedTableWidget(
  companyId: number,
  widgetHash: string,
  data: any,
): Promise<void> {
  try {
    await redis.set(
      tableWidgetKey(companyId, widgetHash),
      JSON.stringify(data),
      "EX",
      TABLE_WIDGET_CACHE_TTL,
    );
  } catch (err) {
    console.error("[dashboard-cache] Failed to set table widget cache:", err);
  }
}

/**
 * Invalidate all table widget caches for a company.
 * Uses SCAN to find and delete matching keys (safe for production).
 */
export async function invalidateTableWidgetCaches(companyId: number): Promise<void> {
  try {
    const pattern = `dashboard:${companyId}:table-widget:*`;
    const prefix = redis.options.keyPrefix || "";
    let cursor = "0";
    let iterations = 0;
    const MAX_SCAN_ITERATIONS = 1000;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        // ioredis SCAN: the MATCH pattern has keyPrefix prepended automatically,
        // and returned keys include the prefix. pipeline.del() will prepend prefix again,
        // so we must strip it. If no keyPrefix is configured, slice(0) is a no-op.
        const pipeline = redis.pipeline();
        const prefixLen = prefix.length;
        for (const key of keys) {
          pipeline.del(key.slice(prefixLen));
        }
        await pipeline.exec();
      }
      iterations++;
      if (iterations >= MAX_SCAN_ITERATIONS) {
        console.error(`[dashboard-cache] SCAN loop hit iteration cap (${MAX_SCAN_ITERATIONS}) for company ${companyId} — some cache keys may not have been invalidated`);
        break;
      }
    } while (cursor !== "0");
  } catch (err) {
    console.error("[dashboard-cache] Failed to invalidate table widget caches:", err);
  }
}

// --- Lock ---

export async function acquireDashboardLock(companyId: number): Promise<string | false> {
  try {
    const lockValue = randomUUID();
    const result = await redis.set(dashboardLockKey(companyId), lockValue, "EX", LOCK_TTL, "NX");
    return result === "OK" ? lockValue : false;
  } catch (err) {
    console.error("[dashboard-cache] Failed to acquire lock, skipping refresh:", err);
    return false; // Redis down — skip and retry later
  }
}

const RELEASE_LOCK_SCRIPT = `if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end`;

export async function releaseDashboardLock(companyId: number, lockValue: string): Promise<void> {
  try {
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, dashboardLockKey(companyId), lockValue);
  } catch (err) {
    console.error("[dashboard-cache] Failed to release lock:", err);
  }
}
