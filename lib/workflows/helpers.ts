import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("Workflows");

/** Authenticate + authorize + rate-limit (returns user or throws) */
export async function requireWorkflowUser(rateLimitKey: "workflowRead" | "workflowMutation") {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewWorkflows")) throw new Error("Forbidden");

  const limited = await checkActionRateLimit(
    String(user.id),
    RATE_LIMITS[rateLimitKey],
  ).catch(() => false);
  if (limited) throw new Error("Rate limit exceeded");

  return user;
}

/** Sanitize Prisma errors so internals never leak to the client */
export function sanitizeError(e: unknown): never {
  const err = e as any;
  if (err?.code === "P2025") throw new Error("Not found");
  if (err?.code === "P2002") throw new Error("Duplicate entry");
  log.error("Unexpected error", { error: String(e) });
  throw new Error("An unexpected error occurred");
}
