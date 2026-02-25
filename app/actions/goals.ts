"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { GoalMetricType, GoalTargetType, GoalPeriodType } from "@prisma/client";
import { inngest } from "@/lib/inngest/client";
import { withRetry } from "@/lib/db-retry";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  MAX_GOALS_PER_COMPANY,
  goalFiltersSchema,
  goalFormDataSchema,
} from "@/lib/validations/goal";
import {
  calculateMetricValue,
  enrichGoalsWithProgress,
  getGoalsForCompanyInternal,
  getGoalCreationDataInternal,
  VALID_METRIC_TYPES,
  VALID_TARGET_TYPES,
  VALID_PERIOD_TYPES,
} from "@/lib/services/goal-computation";
import { createLogger } from "@/lib/logger";

const log = createLogger("Goals");

// Re-export types for backward compatibility
export type { GoalFilters, GoalFormData, GoalWithProgress } from "@/lib/validations/goal";

export type MetricType = GoalMetricType;
export type TargetType = GoalTargetType;
export type PeriodType = GoalPeriodType;

/** Authenticate + authorize + rate-limit (returns user or throws) */
async function requireGoalUser(rateLimitKey: "goalRead" | "goalMutation" | "goalPreview") {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewGoals")) throw new Error("Forbidden");

  const limited = await checkActionRateLimit(
    String(user.id),
    RATE_LIMITS[rateLimitKey],
  ).catch(() => false); // Redis down → allow
  if (limited) throw new Error("Rate limit exceeded");

  return user;
}

// Helper for live preview in the UI - exposed to client
export async function previewGoalValue(
  metricType: MetricType,
  targetType: TargetType,
  periodType: PeriodType,
  startDate: Date,
  endDate: Date,
  rawFilters: unknown,
) {
  if (!VALID_METRIC_TYPES.has(metricType)) throw new Error("Invalid metricType");
  if (!VALID_TARGET_TYPES.has(targetType)) throw new Error("Invalid targetType");
  if (!VALID_PERIOD_TYPES.has(periodType)) throw new Error("Invalid periodType");
  if (!(startDate instanceof Date) || isNaN(startDate.getTime())) throw new Error("Invalid startDate");
  if (!(endDate instanceof Date) || isNaN(endDate.getTime())) throw new Error("Invalid endDate");

  // Validate filters with Zod
  const filters = goalFiltersSchema.parse(rawFilters);

  const user = await requireGoalUser("goalPreview");

  return await calculateMetricValue(
    metricType,
    targetType,
    user.companyId,
    startDate,
    endDate,
    filters,
  );
}

// Create a new goal
export async function createGoal(rawData: unknown) {
  const user = await requireGoalUser("goalMutation");

  // Zod validation
  const parsed = goalFormDataSchema.safeParse(rawData);
  if (!parsed.success) throw new Error("Validation failed");
  const data = parsed.data;

  // Atomic count+create in a Serializable transaction to prevent TOCTOU race
  const goal = await prisma.$transaction(async (tx) => {
    const count = await tx.goal.count({
      where: { companyId: user.companyId, isArchived: false },
    });
    if (count >= MAX_GOALS_PER_COMPANY) {
      throw new Error(`Maximum of ${MAX_GOALS_PER_COMPANY} active goals reached`);
    }

    return tx.goal.create({
      data: {
        companyId: user.companyId,
        name: data.name,
        metricType: data.metricType,
        targetValue: data.targetValue,
        periodType: data.periodType,
        startDate: data.startDate,
        endDate: data.endDate,
        warningThreshold: data.warningThreshold,
        criticalThreshold: data.criticalThreshold,
        notes: data.notes ?? null,
        isActive: true,
        isArchived: false,
        filters: data.filters as any,
        targetType: data.targetType as any,
      },
      select: {
        id: true, name: true, metricType: true, targetValue: true,
        periodType: true, startDate: true, endDate: true,
        warningThreshold: true, criticalThreshold: true, notes: true,
        isActive: true, isArchived: true, filters: true, targetType: true,
        order: true, createdAt: true, updatedAt: true,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePath("/finance/goals");

  // Trigger dashboard goals cache refresh (fire-and-forget — non-critical)
  inngest.send({
    id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
    name: "dashboard/refresh-goals",
    data: { companyId: user.companyId },
  }).catch((e) => log.error("Failed to send dashboard refresh", { error: String(e) }));

  return { ...goal, targetValue: Number(goal.targetValue) };
}

// Archive/Restore Goal
export async function toggleGoalArchive(id: number, isArchived: boolean) {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid goal id");
  if (typeof isArchived !== "boolean") throw new Error("Invalid isArchived");

  const user = await requireGoalUser("goalMutation");

  if (isArchived) {
    // Compute final progress snapshot before archiving (avoids re-computing for archived goals)
    const goalRow = await withRetry(() => prisma.goal.findUnique({
      where: { id, companyId: user.companyId },
      select: {
        id: true, name: true, metricType: true, targetValue: true,
        periodType: true, startDate: true, endDate: true,
        warningThreshold: true, criticalThreshold: true, notes: true,
        isActive: true, isArchived: true, filters: true, targetType: true,
        order: true, createdAt: true, updatedAt: true,
      },
    }));
    if (goalRow) {
      const enriched = await enrichGoalsWithProgress([goalRow], user.companyId);
      const snapshot = enriched[0];
      await prisma.$transaction(async (tx) => {
        const freshGoal = await tx.goal.findUnique({ where: { id, companyId: user.companyId } });
        if (!freshGoal) return;
        const freshFilters = (freshGoal.filters as any) || {};
        await tx.goal.update({
          where: { id, companyId: user.companyId },
          data: {
            isArchived: true,
            filters: {
              ...freshFilters,
              _archivedSnapshot: {
                currentValue: snapshot?.currentValue ?? 0,
                progressPercent: snapshot?.progressPercent ?? 0,
                status: snapshot?.status ?? "CRITICAL",
                projectedValue: snapshot?.projectedValue ?? 0,
                daysRemaining: snapshot?.daysRemaining ?? 0,
                recommendation: snapshot?.recommendation ?? null,
                archivedAt: new Date().toISOString(),
              },
            },
          },
        });
      }, { maxWait: 5000, timeout: 10000 });
    }
  } else {
    await withRetry(() => prisma.goal.update({
      where: { id, companyId: user.companyId },
      data: { isArchived: false },
    }));
  }

  // Trigger dashboard goals cache refresh (fire-and-forget — non-critical)
  inngest.send({
    id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
    name: "dashboard/refresh-goals",
    data: { companyId: user.companyId },
  }).catch((e) => log.error("Failed to send dashboard refresh", { error: String(e) }));

  revalidatePath("/finance/goals");
  revalidatePath("/finance/goals/archive");
}

export async function getGoalsWithProgress() {
  const user = await requireGoalUser("goalRead");

  // Already authenticated — use internal directly
  return getGoalsForCompanyInternal(user.companyId);
}

/**
 * Auth-guarded wrapper for getGoalsForCompanyInternal.
 * Ensures the caller can only access their own company's goals.
 */
export async function getGoalsForCompany(
  companyId: number,
  opts?: { skipCache?: boolean },
) {
  const user = await requireGoalUser("goalRead");
  if (user.companyId !== companyId) throw new Error("Forbidden");
  return getGoalsForCompanyInternal(companyId, opts);
}

export async function getArchivedGoals() {
  const user = await requireGoalUser("goalRead");

  const goals = await withRetry(() => prisma.goal.findMany({
    where: { companyId: user.companyId, isArchived: true },
    orderBy: [{ endDate: "desc" }],
    take: 200,
    select: {
      id: true, name: true, metricType: true, targetValue: true,
      periodType: true, startDate: true, endDate: true,
      warningThreshold: true, criticalThreshold: true, notes: true,
      isActive: true, isArchived: true, filters: true, targetType: true,
      order: true, createdAt: true, updatedAt: true,
    },
  }));

  // Serve from stored snapshot — ZERO metric queries for archived goals
  const goalsWithSnapshot: any[] = [];
  const goalsWithoutSnapshot: any[] = [];

  for (const goal of goals) {
    const filters = ((goal as any).filters as any) || {};
    const snapshot = (filters as any)._archivedSnapshot;

    if (snapshot) {
      const targetType = (goal as any).targetType || "COUNT";
      const targetValue = Number(goal.targetValue);
      const currentValue = snapshot.currentValue ?? 0;
      const progressPercent = snapshot.progressPercent ?? (targetValue > 0 ? Math.round((currentValue / targetValue) * 100) : 0);
      const daysRemaining = snapshot.daysRemaining ?? 0;

      goalsWithSnapshot.push({
        id: goal.id,
        name: goal.name,
        metricType: goal.metricType,
        targetType,
        targetValue,
        currentValue,
        progressPercent,
        periodType: goal.periodType,
        startDate: goal.startDate,
        endDate: goal.endDate,
        filters,
        warningThreshold: goal.warningThreshold,
        criticalThreshold: goal.criticalThreshold,
        status: snapshot.status ?? (progressPercent >= 100 ? "EXCEEDED" : progressPercent >= goal.warningThreshold ? "ON_TRACK" : progressPercent >= goal.criticalThreshold ? "WARNING" : "CRITICAL"),
        isActive: goal.isActive,
        isArchived: true,
        notes: goal.notes,
        daysRemaining,
        projectedValue: snapshot.projectedValue ?? 0,
        recommendation: snapshot.recommendation ?? null,
      });
    } else {
      goalsWithoutSnapshot.push(goal);
    }
  }

  // Live-compute legacy archived goals that were archived before snapshots existed
  if (goalsWithoutSnapshot.length > 0) {
    const liveResults = await enrichGoalsWithProgress(goalsWithoutSnapshot, user.companyId);
    const snapshotPromises: Promise<void>[] = [];

    for (let i = 0; i < liveResults.length; i++) {
      const r = liveResults[i];
      r.isArchived = true;
      goalsWithSnapshot.push(r);

      const legacyGoal = goalsWithoutSnapshot[i];
      const existingFilters = ((legacyGoal as any).filters as any) || {};
      const snapshotData = {
        currentValue: r.currentValue,
        progressPercent: r.progressPercent,
        status: r.status,
        projectedValue: r.projectedValue,
        daysRemaining: r.daysRemaining,
        recommendation: r.recommendation,
        archivedAt: new Date().toISOString(),
      };
      const persistSnapshot = async () => {
        try {
          await withRetry(() => prisma.goal.update({
            where: { id: legacyGoal.id, companyId: user.companyId },
            data: {
              filters: { ...existingFilters, _archivedSnapshot: snapshotData },
            },
          }));
        } catch (e) {
          log.error("Failed to persist snapshot for goal", { goalId: legacyGoal.id, error: String(e) });
        }
      };
      snapshotPromises.push(persistSnapshot());
    }

    await Promise.allSettled(snapshotPromises);
  }

  return goalsWithSnapshot;
}

export async function updateGoalOrder(goalIds: number[]) {
  if (!Array.isArray(goalIds) || goalIds.length === 0) return;
  if (goalIds.length > 200) throw new Error("Too many goals");
  if (!goalIds.every((id) => Number.isInteger(id) && id > 0)) throw new Error("Invalid goal ids");

  const user = await requireGoalUser("goalMutation");

  // Single SQL statement instead of N individual updates
  await withRetry(() => prisma.$executeRaw`
    UPDATE "Goal" AS g
    SET "order" = v.new_order, "updatedAt" = NOW()
    FROM (
      SELECT unnest(${goalIds}::int[]) AS id,
             generate_series(0, ${goalIds.length - 1}) AS new_order
    ) AS v
    WHERE g.id = v.id AND g."companyId" = ${user.companyId}
  `);

  // Invalidate goals cache so dashboard reflects the new order (fire-and-forget)
  inngest.send({
    id: `goals-refresh-${user.companyId}-${Math.floor(Date.now() / 5000)}`,
    name: "dashboard/refresh-goals",
    data: { companyId: user.companyId },
  }).catch((e) => log.error("Failed to send dashboard refresh", { error: String(e) }));

  revalidatePath("/finance/goals");
}

export async function getGoalCreationData() {
  const user = await requireGoalUser("goalRead");
  return getGoalCreationDataInternal(user.companyId);
}
