import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.SESSION_SECRET;

if (!SECRET) {
  throw new Error(
    "FATAL: SESSION_SECRET environment variable is not set. Refusing to start without a session secret."
  );
}

/** Absolute max token lifetime: 7 days */
const TOKEN_MAX_AGE_SECONDS = 604_800;

/** Old 2-part tokens accepted until this date (30-day grace period) */
const LEGACY_TOKEN_CUTOFF = new Date("2026-03-18T00:00:00Z").getTime();

export function signUserId(userId: number): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const data = `${userId}.${issuedAt}`;
  const signature = createHmac("sha256", SECRET!).update(data).digest("hex");
  return `${data}.${signature}`;
}

export interface TokenMeta {
  userId: number;
  issuedAt: number;
}

/**
 * Verify token and return userId + issuedAt metadata.
 * Supports both new 3-part tokens (userId.issuedAt.signature)
 * and legacy 2-part tokens (userId.signature) during grace period.
 */
export function verifyUserIdWithMeta(token: string): TokenMeta | null {
  const parts = token.split(".");

  if (parts.length === 3) {
    // New format: userId.issuedAt.signature
    const [userIdStr, issuedAtStr, signature] = parts;
    if (!userIdStr || !issuedAtStr || !signature) return null;
    if (signature.length !== 64 || !/^[0-9a-f]{64}$/.test(signature)) return null;

    const data = `${userIdStr}.${issuedAtStr}`;
    const expectedSignature = createHmac("sha256", SECRET!)
      .update(data)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "utf-8");
    const expectedBuf = Buffer.from(expectedSignature, "utf-8");
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

    const userId = parseInt(userIdStr, 10);
    const issuedAt = parseInt(issuedAtStr, 10);
    if (!Number.isFinite(userId) || userId <= 0) return null;
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (now - issuedAt > TOKEN_MAX_AGE_SECONDS) return null;

    return { userId, issuedAt };
  }

  if (parts.length === 2) {
    // Legacy format: userId.signature — only accepted during grace period
    if (Date.now() > LEGACY_TOKEN_CUTOFF) return null;

    const [data, signature] = parts;
    if (!data || !signature) return null;
    if (signature.length !== 64 || !/^[0-9a-f]{64}$/.test(signature)) return null;

    const expectedSignature = createHmac("sha256", SECRET!)
      .update(data)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "utf-8");
    const expectedBuf = Buffer.from(expectedSignature, "utf-8");
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

    const userId = parseInt(data, 10);
    if (!Number.isFinite(userId) || userId <= 0) return null;

    // Legacy tokens have no issuedAt — treat as epoch 0 (always passes revocation if not revoked)
    return { userId, issuedAt: 0 };
  }

  return null;
}

/**
 * Verify token and return userId (backward-compatible wrapper).
 */
export function verifyUserId(token: string): number | null {
  const meta = verifyUserIdWithMeta(token);
  return meta ? meta.userId : null;
}
