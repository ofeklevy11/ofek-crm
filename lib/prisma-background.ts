/**
 * Separate Prisma client for Inngest background jobs.
 * Uses a higher statement_timeout (120s) to allow long-running batch operations
 * like bulk deletes, finance sync, and SLA scans without being killed at 15s.
 */
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { createLogger } from "@/lib/logger";

const log = createLogger("PrismaBackground");

const globalForBg = global as unknown as {
  bgPrisma: PrismaClient | undefined;
  bgPool: Pool | undefined;
};

const bgPool =
  globalForBg.bgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    statement_timeout: 120000,    // 120s — matches Inngest finish timeout
    max: 3,                       // fewer connections than main pool — background jobs are less latency-sensitive
    idleTimeoutMillis: 30000,
  });

bgPool.on("error", (err) => {
  log.error("Unexpected error on idle client", { error: String(err) });
});

const bgAdapter = new PrismaPg(bgPool);

export const prismaBg =
  globalForBg.bgPrisma ??
  new PrismaClient({
    adapter: bgAdapter,
    log: process.env.NODE_ENV === "test" ? [] : ["error"],
  });

globalForBg.bgPool = bgPool;
globalForBg.bgPrisma = prismaBg;
