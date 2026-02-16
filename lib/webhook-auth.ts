import { timingSafeEqual } from "crypto";
import { redis } from "@/lib/redis";

/**
 * Timing-safe webhook secret comparison.
 * Prevents timing side-channel attacks that could leak the secret byte-by-byte.
 */
export function verifyWebhookSecret(
  headerValue: string | null,
  expectedSecret: string | undefined,
): boolean {
  if (!headerValue || !expectedSecret) return false;
  if (headerValue.length !== expectedSecret.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(headerValue, "utf-8"),
      Buffer.from(expectedSecret, "utf-8"),
    );
  } catch {
    return false;
  }
}

const IDEMPOTENCY_TTL = 86400; // 24 hours
const MAX_KEY_LENGTH = 256;

/**
 * Check idempotency key from X-Idempotency-Key header.
 * Returns cached response if the key was already processed, null otherwise.
 * After processing, call `setIdempotencyResult` to cache the response.
 */
export async function checkIdempotencyKey(
  req: Request,
  routePrefix: string,
): Promise<{ key: string | null; cachedResponse: Response | null }> {
  const key = req.headers.get("x-idempotency-key");
  if (!key || key.length > MAX_KEY_LENGTH) return { key: null, cachedResponse: null };

  try {
    const cached = await redis.get(`idempotency:${routePrefix}:${key}`);
    if (cached) {
      const { status, body } = JSON.parse(cached);
      return {
        key,
        cachedResponse: new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json", "X-Idempotent-Replayed": "true" },
        }),
      };
    }
  } catch {
    // Redis error — proceed without idempotency rather than blocking
  }

  return { key, cachedResponse: null };
}

/**
 * Cache the response for a processed idempotency key (24h TTL).
 */
export async function setIdempotencyResult(
  routePrefix: string,
  key: string,
  status: number,
  body: unknown,
): Promise<void> {
  try {
    await redis.set(
      `idempotency:${routePrefix}:${key}`,
      JSON.stringify({ status, body }),
      "EX",
      IDEMPOTENCY_TTL,
    );
  } catch {
    // Non-critical — worst case, a retry creates a duplicate
  }
}
