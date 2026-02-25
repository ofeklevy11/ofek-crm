import crypto from "crypto";

export function tokensMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false; // Different lengths throw RangeError
  }
}
