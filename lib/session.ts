import { redis } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("Session");

const SESSION_REVOKE_TTL = 604_800; // 7 days (matches token max age)

function revokeKey(userId: number): string {
  return `user:minIssuedAt:${userId}`;
}

/**
 * Revoke all existing sessions for a user by setting a minimum issuedAt timestamp.
 * Any token issued before this timestamp will be rejected.
 */
export async function revokeUserSessions(userId: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  try {
    await redis.set(revokeKey(userId), String(now), "EX", SESSION_REVOKE_TTL);
  } catch (err) {
    log.error("Failed to revoke sessions for user", { userId, error: String(err) });
  }
}

/**
 * Check if a token's issuedAt timestamp is still valid (not revoked).
 * Returns true if valid, false if the token was issued before the revocation timestamp.
 */
export async function isTokenIssuedAtValid(
  userId: number,
  issuedAt: number
): Promise<boolean> {
  try {
    const minIssuedAt = await redis.get(revokeKey(userId));
    if (!minIssuedAt) return true; // No revocation set — token is valid
    return issuedAt >= parseInt(minIssuedAt, 10);
  } catch {
    // Redis down — fail closed for security (reject token)
    return false;
  }
}
