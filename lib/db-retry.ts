/**
 * Retry wrapper for transient PostgreSQL errors.
 * Retries up to 2 times with exponential backoff + jitter on connection failures, deadlocks, etc.
 */

const TRANSIENT_CODES = new Set([
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now
]);

export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 2, baseDelayMs = 150 } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const code = err?.code || err?.cause?.code;
      if (attempt < maxRetries && typeof code === "string" && TRANSIENT_CODES.has(code)) {
        // Exponential backoff with jitter: 150-225ms, 300-450ms
        const delay = baseDelayMs * Math.pow(2, attempt);
        const jitter = delay * (0.5 + Math.random() * 0.5);
        await new Promise((r) => setTimeout(r, jitter));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
