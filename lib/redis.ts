import Redis from "ioredis";

// We use ioredis because standard HTTP clients (like @upstash/redis)
// don't natively support long-lived subscriptions (Pub/Sub) easily in the same way.
// However, for best Vercel compatibility, ensure you have a "Service URL" in env or similar.

const globalForRedis = globalThis as unknown as { redis: Redis };

function requireRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("FATAL: REDIS_URL environment variable is not set.");
  }
  return url;
}

function createRedisClient(): Redis {
  const client = new Redis(requireRedisUrl(), {
    tls: process.env.REDIS_URL?.includes("rediss://") ? {} : undefined,
    // Add prefix for environment isolation
    keyPrefix:
      (process.env.NODE_ENV === "production" ? "prod:" : "dev:") + "app:",
    connectTimeout: 3000,          // 3s instead of default 10s
    maxRetriesPerRequest: 1,       // 1 retry instead of 20
    enableOfflineQueue: false,     // fail immediately when disconnected
    lazyConnect: true,             // don't connect until first command (needed for Docker build)
    // Do not panic if connection fails, just log
    retryStrategy: (times) => {
      if (times === 1) console.warn("[redis] Connection lost, attempting reconnection…");
      // Reconnect with exponential backoff
      return Math.min(times * 50, 2000);
    },
  });
  // Prevent unhandled error events from crashing the process
  client.on("error", () => { /* handled by retryStrategy */ });
  return client;
}

export const redis = globalForRedis.redis || createRedisClient();

globalForRedis.redis = redis;

// Singleton pattern for Publisher as well to avoid too many connections
const globalPublisher = globalThis as unknown as { redisPublisher: Redis };

function createRedisPublisher(): Redis {
  const client = new Redis(requireRedisUrl(), {
    tls: process.env.REDIS_URL?.includes("rediss://") ? {} : undefined,
    keyPrefix:
      (process.env.NODE_ENV === "production" ? "prod:" : "dev:") + "app:",
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  client.on("error", () => { /* handled by retryStrategy */ });
  return client;
}

export const redisPublisher =
  globalPublisher.redisPublisher || createRedisPublisher();

globalPublisher.redisPublisher = redisPublisher;
