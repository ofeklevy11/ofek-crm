import Redis from "ioredis";
import { createLogger } from "@/lib/logger";

const log = createLogger("RedisSubscriber");

type MessageHandler = (channel: string, message: string) => void;

/**
 * Shared Redis subscriber with channel multiplexing.
 * Instead of creating one Redis connection per SSE client (redis.duplicate()),
 * this module uses a single subscriber connection and routes messages
 * to the correct handlers based on channel.
 */

const globalForSubscriber = globalThis as unknown as {
  sharedSubscriber: SharedSubscriber;
};

class SharedSubscriber {
  private sub: Redis;
  // Map<channel, Set<handler>>
  private handlers = new Map<string, Set<MessageHandler>>();
  private connected = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("FATAL: REDIS_URL environment variable is not set.");
    }
    this.sub = new Redis(redisUrl, {
      tls: process.env.REDIS_URL?.includes("rediss://") ? {} : undefined,
      keyPrefix:
        (process.env.NODE_ENV === "production" ? "prod:" : "dev:") + "app:",
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.sub.on("message", (channel: string, message: string) => {
      const channelHandlers = this.handlers.get(channel);
      if (!channelHandlers) return;
      channelHandlers.forEach((handler) => {
        try {
          handler(channel, message);
        } catch (err) {
          log.error("Handler error on channel", { channel, error: String(err) });
        }
      });
    });

    this.sub.on("error", () => {
      // Silently handle — retryStrategy handles reconnection
    });

    // Re-subscribe all active channels after Redis reconnects.
    // ioredis does NOT restore subscriptions automatically.
    this.sub.on("ready", () => {
      this.connected = true;
      const activeChannels = Array.from(this.handlers.keys());
      if (activeChannels.length > 0) {
        this.sub.subscribe(...activeChannels).catch(() => {});
      }
    });
  }

  /**
   * Subscribe a handler to one or more channels.
   * Returns an unsubscribe function for cleanup.
   */
  async subscribe(
    channels: string[],
    handler: MessageHandler,
  ): Promise<() => void> {
    const newChannels: string[] = [];

    for (const ch of channels) {
      let set = this.handlers.get(ch);
      if (!set) {
        set = new Set();
        this.handlers.set(ch, set);
        newChannels.push(ch);
      }
      set.add(handler);
    }

    // Only subscribe to Redis for channels that are truly new
    if (newChannels.length > 0) {
      if (this.connected) {
        await this.sub.subscribe(...newChannels);
      } else {
        log.warn("Redis not yet connected, queuing channels — will subscribe on ready", { channelCount: newChannels.length });
      }
    }

    // Return cleanup function
    return async () => {
      const emptyChannels: string[] = [];

      for (const ch of channels) {
        const set = this.handlers.get(ch);
        if (set) {
          set.delete(handler);
          if (set.size === 0) {
            this.handlers.delete(ch);
            emptyChannels.push(ch);
          }
        }
      }

      // Only unsubscribe from Redis for channels with no remaining handlers
      if (emptyChannels.length > 0 && this.connected) {
        await this.sub.unsubscribe(...emptyChannels).catch(() => {});
      }
    };
  }
}

export const sharedSubscriber =
  globalForSubscriber.sharedSubscriber || new SharedSubscriber();

if (process.env.NODE_ENV !== "production") {
  globalForSubscriber.sharedSubscriber = sharedSubscriber;
}
