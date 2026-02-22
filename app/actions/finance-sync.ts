"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";
import { withRetry } from "@/lib/db-retry";
import { ensureDefaultSyncRules, clearDefaultRulesCache } from "@/lib/finance-sync-internal";
import type { SyncMapping } from "@/lib/finance-sync-internal";

export async function createSyncRule(data: {
  name: string;
  targetType: "INCOME" | "EXPENSE";
  sourceType:
    | "TABLE"
    | "TRANSACTIONS"
    | "RETAINERS"
    | "FIXED_EXPENSES"
    | "PAYMENTS_RETAINERS";
  sourceId?: number; // Optional for system sources
  fieldMapping: SyncMapping;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    throw new Error("Rate limit exceeded");
  }

  // Input validation
  if (!data.name || typeof data.name !== "string" || data.name.length > 200) {
    throw new Error("Invalid rule name");
  }
  if (!["INCOME", "EXPENSE"].includes(data.targetType)) {
    throw new Error("Invalid target type");
  }
  if (!["TABLE", "TRANSACTIONS", "RETAINERS", "FIXED_EXPENSES", "PAYMENTS_RETAINERS"].includes(data.sourceType)) {
    throw new Error("Invalid source type");
  }

  // Validate fieldMapping structure
  if (!data.fieldMapping || typeof data.fieldMapping !== "object") {
    throw new Error("Invalid field mapping");
  }
  const fm = data.fieldMapping;
  if (typeof fm.amountField !== "string" || fm.amountField.length > 200) {
    throw new Error("Invalid field mapping: amountField");
  }
  if (typeof fm.dateField !== "string" || fm.dateField.length > 200) {
    throw new Error("Invalid field mapping: dateField");
  }
  if (typeof fm.titleField !== "string" || fm.titleField.length > 200) {
    throw new Error("Invalid field mapping: titleField");
  }
  if (fm.categoryValue !== undefined && (typeof fm.categoryValue !== "string" || fm.categoryValue.length > 200)) {
    throw new Error("Invalid field mapping: categoryValue");
  }
  if (fm.categoryField !== undefined && (typeof fm.categoryField !== "string" || fm.categoryField.length > 200)) {
    throw new Error("Invalid field mapping: categoryField");
  }

  if (data.sourceType === "TABLE" && !data.sourceId) {
    throw new Error("sourceId is required for TABLE source type");
  }

  // Verify sourceId belongs to user's company for TABLE sources
  if (data.sourceType === "TABLE" && data.sourceId) {
    const table = await withRetry(() => prisma.tableMeta.findFirst({
      where: { id: data.sourceId, companyId: user.companyId },
      select: { id: true },
    }));
    if (!table) {
      throw new Error("Invalid sourceId — table not found");
    }
  }

  const rule = await withRetry(() => prisma.financeSyncRule.create({
    data: {
      companyId: user.companyId,
      name: data.name.slice(0, 200),
      targetType: data.targetType as any,
      sourceType: data.sourceType as any,
      sourceId: data.sourceId,
      fieldMapping: data.fieldMapping as any,
    },
  }));

  clearDefaultRulesCache(user.companyId);
  return rule;
}

export async function updateSyncRule(
  id: number,
  data: { name?: string; targetType?: "INCOME" | "EXPENSE" },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    throw new Error("Rate limit exceeded");
  }

  // Input validation
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid rule ID");
  if (data.name !== undefined && (typeof data.name !== "string" || data.name.length > 200)) {
    throw new Error("Invalid rule name");
  }
  if (data.targetType !== undefined && !["INCOME", "EXPENSE"].includes(data.targetType)) {
    throw new Error("Invalid target type");
  }

  const updated = await withRetry(() => prisma.$transaction(async (tx) => {
    const existing = await tx.financeSyncRule.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!existing) return null;

    return tx.financeSyncRule.update({
      where: { id },
      data: {
        name: data.name,
        targetType: data.targetType as any,
      },
    });
  }));

  if (!updated) throw new Error("Sync rule not found");

  revalidatePath("/finance/collect");
  revalidatePath("/finance/income-expenses");
}

/**
 * Enqueue a finance sync job to run in the background via Inngest.
 * Returns immediately with the jobId for polling.
 */
export async function enqueueSyncJob(ruleId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    throw new Error("Rate limit exceeded");
  }

  if (!Number.isInteger(ruleId) || ruleId <= 0) throw new Error("Invalid rule ID");

  const rule = await withRetry(() => prisma.financeSyncRule.findFirst({
    where: { id: ruleId, companyId: user.companyId },
    select: { id: true },
  }));

  if (!rule)
    throw new Error("Rule not found");

  // Serializable transaction to prevent duplicate job creation race condition
  const result = await withRetry(() => prisma.$transaction(async (tx) => {
    const existingJob = await tx.financeSyncJob.findFirst({
      where: {
        syncRuleId: ruleId,
        companyId: user.companyId,
        status: { in: ["QUEUED", "RUNNING"] },
      },
    });

    if (existingJob) {
      return { jobId: existingJob.id, isNew: false };
    }

    const job = await tx.financeSyncJob.create({
      data: {
        companyId: user.companyId,
        syncRuleId: ruleId,
        status: "QUEUED",
      },
    });

    return { jobId: job.id, isNew: true };
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 }));

  if (result.isNew) {
    await inngest.send({
      id: `finance-sync-${user.companyId}-${ruleId}-${result.jobId}`,
      name: "finance-sync/job.started",
      data: {
        jobId: result.jobId,
        syncRuleId: ruleId,
        companyId: user.companyId,
      },
    });
  }

  return { jobId: result.jobId };
}

export async function deleteSyncRule(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFinance")) throw new Error("Forbidden");

  const { checkActionRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit");
  if (await checkActionRateLimit(String(user.id), RATE_LIMITS.financeMutation)) {
    throw new Error("Rate limit exceeded");
  }

  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid rule ID");

  // Delete records + rule atomically to prevent partial cleanup
  await withRetry(() => prisma.$transaction(async (tx) => {
    await tx.financeRecord.deleteMany({
      where: { syncRuleId: id, companyId: user.companyId },
    });
    await tx.financeSyncRule.delete({
      where: { id, companyId: user.companyId },
    });
  }));

  clearDefaultRulesCache(user.companyId);
  revalidatePath("/finance/collect");
  revalidatePath("/finance/income-expenses");
}

export async function getSyncRules() {
  const user = await getCurrentUser();
  if (!user) return [];
  if (!hasUserFlag(user, "canViewFinance")) return [];

  await ensureDefaultSyncRules(user.companyId);

  return withRetry(() => prisma.financeSyncRule.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
    take: 200, // P76: Bound user sync rules query
  }));
}
