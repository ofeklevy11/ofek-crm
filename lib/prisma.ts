import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { dbQueryDuration } from "@/lib/metrics";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
  shutdownRegistered: boolean | undefined;
};

const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    statement_timeout: 15000,       // 15s — abort runaway queries
    max: 10,                         // VPS runs single process, higher pool is appropriate
    idleTimeoutMillis: 30000,        // release idle connections after 30s
  });

// Prevent unhandled rejection crashes from idle connection errors
pool.on("error", (err) => {
  console.error("[pg-pool] Unexpected error on idle client:", err);
});

const adapter = new PrismaPg(pool);

// --- Configuration ---
const SLOW_QUERY_THRESHOLD_MS = 500;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 150;

// Transient PostgreSQL error codes that are safe to retry
const TRANSIENT_CODES = new Set([
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now
]);

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as any)?.code || (err as any)?.cause?.code;
  return typeof code === "string" && TRANSIENT_CODES.has(code);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "test" ? [] : ["error"],
  });

// --- Tenant isolation enforcement ---
// Models that don't have companyId field (exempt from isolation check).
// Child models derive isolation via CASCADE from parent.
const TENANT_EXEMPT_MODELS = new Set([
  "Company",               // IS the tenant
  "WorkflowStage",         // child of Workflow (CASCADE)
  "QuoteItem",             // child of Quote (CASCADE)
  "TicketComment",         // child of Ticket (CASCADE)
  "TicketActivityLog",     // child of Ticket (CASCADE)
  "NurtureSubscriber",     // child of NurtureList (CASCADE)
  "PaymentMethodInternal", // child of Client (CASCADE)
  "TaskSheetItem",         // child of TaskSheet (CASCADE)
]);

// Operations that MUST include companyId — high risk for cross-tenant data leakage
const STRICT_OPERATIONS = new Set([
  "findFirst", "findFirstOrThrow", "findMany",
  "updateMany", "deleteMany",
  "count", "groupBy", "aggregate",
]);

// Operations that SHOULD include companyId but are lower risk (single-record by unique key)
const WARN_OPERATIONS = new Set([
  "findUnique", "findUniqueOrThrow",
  "update", "delete", "upsert",
]);

function hasCompanyIdInWhere(args: any): boolean {
  if (!args?.where) return false;
  return JSON.stringify(args.where).includes('"companyId"');
}

export const prisma = basePrisma.$extends({
  query: {
    async $allOperations({ operation, model, args, query }) {
      // Tenant isolation: ensure companyId is present in WHERE for tenant-scoped models
      if (model && !TENANT_EXEMPT_MODELS.has(model) && !hasCompanyIdInWhere(args)) {
        if (STRICT_OPERATIONS.has(operation)) {
          const msg = `TENANT_ISOLATION: companyId missing in ${model}.${operation}`;
          if (process.env.NODE_ENV === "test") {
            throw new Error(msg);
          } else if (process.env.NODE_ENV === "development") {
            console.error(msg, new Error().stack);
          } else {
            console.warn(`[tenant-isolation] ${msg}`);
          }
        } else if (WARN_OPERATIONS.has(operation)) {
          console.warn(`[tenant-isolation] companyId missing in ${model}.${operation}`);
        }
      }

      let lastError: unknown;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const start = performance.now();
        try {
          const result = await query(args);
          const duration = performance.now() - start;
          dbQueryDuration.observe({ operation }, duration / 1000);
          if (duration > SLOW_QUERY_THRESHOLD_MS) {
            console.warn(
              `[slow-query] ${model ?? "prisma"}.${operation} took ${duration.toFixed(0)}ms`,
            );
          }
          return result;
        } catch (err) {
          lastError = err;
          if (attempt < MAX_RETRIES && isTransientError(err)) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            const jitter = delay * (0.5 + Math.random() * 0.5);
            console.warn(
              `[db-retry] ${model ?? "prisma"}.${operation} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${jitter.toFixed(0)}ms`,
            );
            await sleep(jitter);
            continue;
          }
          throw err;
        }
      }
      throw lastError;
    },
  },
});

// Always cache in global to prevent orphaned pools on module re-evaluation
globalForPrisma.pool = pool;
globalForPrisma.prisma = basePrisma;

// Graceful pool shutdown — drain connections on process exit
if (!globalForPrisma.shutdownRegistered) {
  const shutdown = () => {
    pool.end().catch((err) => {
      console.error("[pg-pool] Error during shutdown:", err);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  globalForPrisma.shutdownRegistered = true;
}
