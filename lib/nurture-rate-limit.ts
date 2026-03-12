import { redis } from "@/lib/redis";
import { checkMemoryRateLimit } from "@/lib/rate-limit-action";

export type UserTier = "basic" | "premium" | "super";

const TIER_LIMITS: Record<UserTier, number> = {
  basic: 3,
  premium: 6,
  super: Infinity,
};

const WINDOW_SECONDS = 60;

/**
 * Lua script: atomic INCRBY + conditional EXPIRE + rollback if over limit.
 * Returns [allowed (0|1), remaining, ttl].
 */
const CONSUME_LUA = `
local key = KEYS[1]
local amount = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local window = tonumber(ARGV[3])
local current = redis.call('INCRBY', key, amount)
if current == amount then redis.call('EXPIRE', key, window) end
local ttl = redis.call('TTL', key)
if ttl < 0 then ttl = window end
if current > limit then
  redis.call('DECRBY', key, amount)
  local rem = limit - (current - amount)
  if rem < 0 then rem = 0 end
  return {0, rem, ttl}
end
return {1, limit - current, ttl}
`;

function redisKey(userId: number) {
  return `rl:nurture-msg:${userId}`;
}

export async function consumeNurtureQuota(
  userId: number,
  tier: UserTier,
  channelCount: number
): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  const limit = TIER_LIMITS[tier];
  if (limit === Infinity) {
    return { allowed: true, remaining: Infinity, resetInSeconds: 0 };
  }

  try {
    const result = (await redis.eval(
      CONSUME_LUA,
      1,
      redisKey(userId),
      channelCount,
      limit,
      WINDOW_SECONDS
    )) as [number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetInSeconds: result[2],
    };
  } catch {
    // Redis down — fallback to in-memory
    const memKey = `rl:nurture-msg:${userId}`;
    // Check each channel unit individually
    let blocked = false;
    for (let i = 0; i < channelCount; i++) {
      if (checkMemoryRateLimit(memKey, limit, WINDOW_SECONDS)) {
        blocked = true;
        break;
      }
    }
    return {
      allowed: !blocked,
      remaining: blocked ? 0 : Math.max(0, limit - channelCount),
      resetInSeconds: WINDOW_SECONDS,
    };
  }
}

export async function getNurtureQuotaStatus(
  userId: number,
  tier: UserTier
): Promise<{
  used: number;
  limit: number;
  remaining: number;
  resetInSeconds: number;
  tier: UserTier;
}> {
  const limit = TIER_LIMITS[tier];
  if (limit === Infinity) {
    return { used: 0, limit: Infinity, remaining: Infinity, resetInSeconds: 0, tier };
  }

  try {
    const key = redisKey(userId);
    const [countStr, ttl] = await Promise.all([
      redis.get(key),
      redis.ttl(key),
    ]);
    const used = countStr ? parseInt(countStr, 10) : 0;
    const resetIn = ttl > 0 ? ttl : 0;
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetInSeconds: resetIn,
      tier,
    };
  } catch {
    // Redis down — return safe defaults
    return { used: 0, limit, remaining: limit, resetInSeconds: 0, tier };
  }
}
