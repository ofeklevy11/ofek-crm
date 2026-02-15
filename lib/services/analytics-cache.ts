import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";

const FULL_CACHE_TTL = 4 * 60 * 60; // 4 hours in seconds
const ITEM_CACHE_TTL = 4 * 60 * 60; // 4 hours in seconds
const LOCK_TTL = 300; // 5 minutes

function fullKey(companyId: number) {
  return `analytics:${companyId}:all`;
}

function itemKey(companyId: number, type: "rule" | "view", id: number) {
  return `analytics:${companyId}:${type}:${id}`;
}

function lockKey(companyId: number) {
  return `analytics:${companyId}:refresh-lock`;
}

export async function getFullAnalyticsCache(companyId: number): Promise<any[] | null> {
  try {
    const raw = await redis.get(fullKey(companyId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setFullAnalyticsCache(companyId: number, views: any[]): Promise<void> {
  try {
    await redis.set(fullKey(companyId), JSON.stringify(views), "EX", FULL_CACHE_TTL);
  } catch (err) {
    console.error("[analytics-cache] Failed to set full cache:", err);
  }
}

export async function getSingleItemCache(
  companyId: number,
  type: "rule" | "view",
  id: number,
): Promise<any | null> {
  try {
    const raw = await redis.get(itemKey(companyId, type, id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setSingleItemCache(
  companyId: number,
  type: "rule" | "view",
  id: number,
  data: any,
): Promise<void> {
  try {
    await redis.set(itemKey(companyId, type, id), JSON.stringify(data), "EX", ITEM_CACHE_TTL);
  } catch (err) {
    console.error("[analytics-cache] Failed to set item cache:", err);
  }
}

export async function invalidateFullCache(companyId: number): Promise<void> {
  try {
    await redis.del(fullKey(companyId));
  } catch (err) {
    console.error("[analytics-cache] Failed to invalidate full cache:", err);
  }
}

export async function invalidateItemCache(companyId: number, type: "rule" | "view", id: number): Promise<void> {
  try {
    await redis.del(itemKey(companyId, type, id));
  } catch (err) {
    console.error("[analytics-cache] Failed to invalidate item cache:", err);
  }
}

export async function isRefreshLockHeld(companyId: number): Promise<boolean> {
  try {
    const result = await redis.exists(lockKey(companyId));
    return result === 1;
  } catch {
    return false; // Redis down — assume no lock
  }
}

// P205: Use unique lock value to prevent releasing another process's lock
export async function acquireRefreshLock(companyId: number): Promise<string | false> {
  try {
    const lockValue = randomUUID();
    const result = await redis.set(lockKey(companyId), lockValue, "EX", LOCK_TTL, "NX");
    return result === "OK" ? lockValue : false;
  } catch {
    return false; // Redis down — do not pretend lock was acquired
  }
}

const RELEASE_LOCK_SCRIPT = `if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end`;

export async function releaseRefreshLock(companyId: number, lockValue: string): Promise<void> {
  try {
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey(companyId), lockValue);
  } catch (err) {
    console.error("[analytics-cache] Failed to release lock:", err);
  }
}
