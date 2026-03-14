import { randomBytes } from "crypto";

/**
 * Generate a cryptographically secure token using crypto.randomBytes.
 * Returns a 32-byte random value encoded as base64url (43 chars).
 * Unlike CUIDs, these are not timestamp-based and cannot be predicted.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Regex for validating secure tokens (base64url, 20-64 chars) */
export const SECURE_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
