import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Retrieves a cached metric or calculates it if missing/stale.
 * Implements a "Cache-Aside" strategy with "Dogpiling" prevention.
 *
 * Strategy:
 * 1. Try to read from cache (cheap read).
 * 2. If valid (TTL not expired), return immediately.
 * 3. If missing or stale:
 *    a. Lock the row to prevent concurrent calculations.
 *    b. If we have stale data, we prefer returning it rather than waiting for the lock (NOWAIT),
 *       unless the data is completely missing.
 *    c. If we acquire the lock, we re-check validity (double-checked locking).
 *    d. If still stale/missing, we compute the new value and update the cache.
 */
export async function getCachedMetric<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 4 * 60 * 60, // Default: 4 hours
): Promise<T> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - ttlSeconds * 1000);

  // 1. Initial Check (No Lock)
  const cached = await prisma.cachedMetric.findUnique({
    where: { key },
  });

  // If exists and fresh, return immediately
  if (cached && cached.updatedAt > cutoff) {
    return cached.value as T;
  }

  // Define if we should wait for the lock or fail fast (return stale)
  // If we have no data, we MUST wait for the calculation.
  const mustWaitForResult = !cached;

  try {
    return await prisma.$transaction(
      async (tx) => {
        // 2. Ensure row exists creates a lockable target
        // We use raw SQL for atomic "Insert if not exists" behavior that works reliably with locking
        await tx.$executeRaw`
        INSERT INTO cached_metrics (key, value, updated_at) 
        VALUES (${key}, 'null'::jsonb, '1970-01-01 00:00:00'::timestamp) 
        ON CONFLICT (key) DO NOTHING
      `;

        // 3. Attempt to acquire lock
        let lockedRow: { value: any; updated_at: Date } | undefined;

        if (mustWaitForResult) {
          // No data available: We must block and wait for the lock to ensure we get data
          const result = await tx.$queryRaw<
            Array<{ value: any; updated_at: Date }>
          >`
          SELECT value, updated_at 
          FROM cached_metrics 
          WHERE key = ${key} 
          FOR UPDATE
        `;
          lockedRow = result[0];
        } else {
          // Data available (stale): Try to lock without waiting.
          // If locked by another process, we'll catch the error and return stale data.
          try {
            const result = await tx.$queryRaw<
              Array<{ value: any; updated_at: Date }>
            >`
            SELECT value, updated_at 
            FROM cached_metrics 
            WHERE key = ${key} 
            FOR UPDATE NOWAIT
          `;
            lockedRow = result[0];
          } catch (e: any) {
            // Check for Postgres "Lock Not Available" error (55P03)
            // Prisma might wrap this, so we check generally.
            const isLockError =
              e.code === "P2010" ||
              e.meta?.code === "55P03" ||
              (e.message && e.message.includes("55P03")) ||
              (e.message && e.message.includes("could not obtain lock"));

            if (isLockError && cached) {
              // Someone else is calculating. Return our stale data!
              return cached.value as T;
            }
            throw e; // Rethrow other errors
          }
        }

        // If we got here, we have the lock.
        if (!lockedRow) {
          throw new Error(
            "Unexpected error: Cache row missing immediately after insert.",
          );
        }

        // 4. Double-Check: Did someone update it while we were waiting (in the blocking case)?
        const lockedUpdatedAt = new Date(lockedRow.updated_at);
        if (lockedUpdatedAt > cutoff && lockedRow.value !== null) {
          return lockedRow.value as T;
        }

        // 5. Compute new value
        // Note: This runs inside the transaction lock.
        // Ensure fetcher is reasonably fast or optimized for DB performance.
        const newValue = await fetcher();

        // 6. Update Cache
        await tx.cachedMetric.update({
          where: { key },
          data: {
            value: newValue as any,
            updatedAt: new Date(), // Now
          },
        });

        return newValue;
      },
      {
        timeout: 30000, // Wait up to 30s for the transaction
        maxWait: 5000, // Wait up to 5s to acquire a connection
      },
    );
  } catch (error) {
    // Fallback: If calculation/transaction fails (e.g. timeout), and we have stale data, return it.
    if (cached) {
      console.warn(
        `Cache refresh failed for key "${key}". Returning stale data. Error:`,
        error,
      );
      return cached.value as T;
    }
    // If no stale data and failed, we must throw.
    throw error;
  }
}
