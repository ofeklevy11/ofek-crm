import Redis from "ioredis";

// We use ioredis because standard HTTP clients (like @upstash/redis)
// don't natively support long-lived subscriptions (Pub/Sub) easily in the same way.
// However, for best Vercel compatibility, ensure you have a "Service URL" in env or similar.

const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ||
  new Redis(process.env.REDIS_URL || "", {
    tls: process.env.REDIS_URL?.includes("rediss://") ? {} : undefined,
    // Add prefix for environment isolation
    keyPrefix:
      (process.env.NODE_ENV === "production" ? "prod:" : "dev:") + "app:",
    // Do not panic if connection fails, just log
    retryStrategy: (times) => {
      // Reconnect with exponential backoff
      return Math.min(times * 50, 2000);
    },
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Singleton pattern for Publisher as well to avoid too many connections in HMR
const globalPublisher = globalThis as unknown as { redisPublisher: Redis };

export const redisPublisher =
  globalPublisher.redisPublisher ||
  new Redis(process.env.REDIS_URL || "", {
    tls: process.env.REDIS_URL?.includes("rediss://") ? {} : undefined,
    keyPrefix:
      (process.env.NODE_ENV === "production" ? "prod:" : "dev:") + "app:",
  });

if (process.env.NODE_ENV !== "production") {
  globalPublisher.redisPublisher = redisPublisher;
}
