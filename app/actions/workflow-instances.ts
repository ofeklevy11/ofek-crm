"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { validateUserInCompany } from "@/lib/company-validation";
import { withRetry } from "@/lib/db-retry";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  createWorkflowInstanceSchema,
  instanceStatusSchema,
} from "@/lib/workflows/validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("WorkflowInstances");

// ── Resource caps ──────────────────────────────────────────────────────
const MAX_INSTANCES_PER_WORKFLOW = 500;

// ── Helpers ────────────────────────────────────────────────────────────

/** Authenticate + authorize + rate-limit (returns user or throws) */
async function requireWorkflowUser(rateLimitKey: "workflowRead" | "workflowMutation") {
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
function sanitizeError(e: unknown): never {
  const err = e as any;
  if (err?.code === "P2025") throw new Error("Not found");
  if (err?.code === "P2002") throw new Error("Duplicate entry");
  log.error("Unexpected error", { error: String(e) });
  throw new Error("An unexpected error occurred");
}

// ── Queries ────────────────────────────────────────────────────────────

export async function getWorkflowInstances(
  status?: string,
  opts?: { workflowId?: number; cursor?: number },
) {
  const user = await requireWorkflowUser("workflowRead");

  // Validate status enum
  const parsedStatus = instanceStatusSchema.parse(status);

  // Validate optional numeric params
  if (opts?.workflowId !== undefined && (!Number.isInteger(opts.workflowId) || opts.workflowId <= 0)) {
    throw new Error("Invalid workflowId");
  }
  if (opts?.cursor !== undefined && (!Number.isInteger(opts.cursor) || opts.cursor <= 0)) {
    throw new Error("Invalid cursor");
  }

  return withRetry(() => prisma.workflowInstance.findMany({
    where: {
      companyId: user.companyId,
      ...(parsedStatus ? { status: parsedStatus } : {}),
      ...(opts?.workflowId ? { workflowId: opts.workflowId } : {}),
    },
    select: {
      id: true,
      workflowId: true,
      name: true,
      status: true,
      currentStageId: true,
      completedStages: true,
      creatorId: true,
      assigneeId: true,
      createdAt: true,
      updatedAt: true,
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    ...(opts?.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  }));
}

// ── Mutations ──────────────────────────────────────────────────────────

export async function createWorkflowInstance(data: {
  workflowId: number;
  name: string;
  assigneeId?: number;
}) {
  const user = await requireWorkflowUser("workflowMutation");
  const parsed = createWorkflowInstanceSchema.parse(data);

  // SECURITY: Validate assigneeId belongs to same company (before transaction to avoid holding it open)
  if (parsed.assigneeId) {
    if (!(await validateUserInCompany(parsed.assigneeId, user.companyId))) {
      throw new Error("Invalid assignee");
    }
  }

  try {
    // Transaction to prevent FK violation if workflow is deleted between read and create
    const instance = await withRetry(() => prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.findFirst({
        where: { id: parsed.workflowId, companyId: user.companyId },
        include: {
          stages: { orderBy: { order: "asc" }, take: 1, select: { id: true } },
          _count: { select: { instances: true } },
        },
      });

      if (!workflow) throw new Error("Workflow not found or access denied");

      // Resource cap
      if (workflow._count.instances >= MAX_INSTANCES_PER_WORKFLOW) {
        throw new Error(`Maximum of ${MAX_INSTANCES_PER_WORKFLOW} instances per workflow reached`);
      }

      return tx.workflowInstance.create({
        data: {
          companyId: user.companyId,
          workflowId: parsed.workflowId,
          name: parsed.name,
          creatorId: user.id,
          assigneeId: parsed.assigneeId,
          status: "active",
          currentStageId: workflow.stages[0]?.id || null,
          completedStages: [],
        },
        select: {
          id: true, workflowId: true, name: true, status: true,
          currentStageId: true, completedStages: true,
          creatorId: true, assigneeId: true,
          createdAt: true, updatedAt: true,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workflows");
    return instance;
  } catch (e) {
    if (e instanceof Error && (e.message.includes("Maximum") || e.message.includes("not found"))) throw e;
    sanitizeError(e);
  }
}

export async function updateWorkflowInstanceStage(
  instanceId: number,
  stageId: number,
  completed: boolean,
) {
  const user = await requireWorkflowUser("workflowMutation");

  if (!Number.isInteger(instanceId) || instanceId <= 0) throw new Error("Invalid instanceId");
  if (!Number.isInteger(stageId) || stageId <= 0) throw new Error("Invalid stageId");
  if (typeof completed !== "boolean") throw new Error("Invalid completed flag");

  try {
    // Transaction with Serializable isolation to prevent lost-update race on completedStages JSON array.
    const result = await withRetry(() => prisma.$transaction(async (tx) => {
      // CRITICAL: Verify instance belongs to user's company
      const instance = await tx.workflowInstance.findFirst({
        where: { id: instanceId, companyId: user.companyId },
        select: {
          id: true,
          name: true,
          completedStages: true,
          workflow: {
            select: {
              stages: {
                select: { id: true, name: true, order: true },
                orderBy: { order: "asc" },
              },
            },
          },
        },
      });

      if (!instance) throw new Error("Instance not found or access denied");

      // Validate stageId belongs to this workflow
      if (!instance.workflow.stages.some((s) => s.id === stageId)) {
        throw new Error("Stage does not belong to this workflow");
      }

      let currentCompleted = (instance.completedStages as number[]) || [];

      if (completed) {
        if (!currentCompleted.includes(stageId)) {
          currentCompleted.push(stageId);
        }

        const currentStageIndex = instance.workflow.stages.findIndex(
          (s) => s.id === stageId,
        );
        const stageInfo = instance.workflow.stages[currentStageIndex];
        const nextStage = instance.workflow.stages[currentStageIndex + 1];

        // Fetch details only for the completed stage (avoids loading all stages' details)
        const stageWithDetails = stageInfo
          ? await tx.workflowStage.findUnique({
              where: { id: stageInfo.id },
              select: { id: true, name: true, details: true },
            })
          : null;
        const completedStage = stageWithDetails ? { ...stageInfo, details: stageWithDetails.details } : stageInfo;

        await tx.workflowInstance.update({
          where: { id: instanceId, companyId: user.companyId },
          data: {
            completedStages: currentCompleted,
            currentStageId: nextStage ? nextStage.id : null,
            status: nextStage ? "active" : "completed",
          },
        });

        return { instance, completedStage };
      } else {
        currentCompleted = currentCompleted.filter((id) => id !== stageId);

        await tx.workflowInstance.update({
          where: { id: instanceId, companyId: user.companyId },
          data: {
            completedStages: currentCompleted,
            currentStageId: stageId,
            status: "active",
          },
        });

        return { instance, completedStage: null };
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));

    // TRIGGER AUTOMATION outside transaction — dispatch to Inngest for background execution
    const { instance, completedStage } = result;
    if (
      completed &&
      completedStage &&
      (completedStage.details as any)?.systemActions?.length
    ) {
      try {
        const { inngest } = await import("@/lib/inngest/client");
        await inngest.send({
          name: "workflow/execute-stage-automations",
          data: {
            stageDetails: completedStage.details,
            stageName: completedStage.name,
            stageId: completedStage.id,
            instanceId: instance.id,
            instanceName: instance.name,
            companyId: user.companyId,
            userId: user.id,
          },
        });
      } catch (e) {
        log.error("Failed to enqueue workflow automations", { error: String(e) });
        try {
          const { createNotificationForCompany } = await import("@/lib/notifications-internal");
          await createNotificationForCompany({
            companyId: user.companyId,
            userId: user.id,
            title: "אוטומציות תהליך עבודה לא נשלחו",
            message: `האוטומציות של שלב "${completedStage.name}" בתהליך "${instance.name}" לא הצליחו להישלח. נסה שוב.`,
            link: "/workflows",
          });
        } catch (_) {
          // notification itself failed — nothing more we can do
        }
      }
    }

    revalidatePath("/workflows");
  } catch (e) {
    if (e instanceof Error && (
      e.message.includes("not found") ||
      e.message.includes("access denied") ||
      e.message === "Stage does not belong to this workflow"
    )) throw e;
    sanitizeError(e);
  }
}

export async function resetWorkflowInstance(instanceId: number) {
  const user = await requireWorkflowUser("workflowMutation");

  if (!Number.isInteger(instanceId) || instanceId <= 0) throw new Error("Invalid instanceId");

  try {
    await withRetry(() => prisma.$transaction(async (tx) => {
      const instance = await tx.workflowInstance.findFirst({
        where: { id: instanceId, companyId: user.companyId },
        select: {
          id: true,
          workflow: {
            select: {
              stages: {
                select: { id: true },
                orderBy: { order: "asc" },
                take: 1,
              },
            },
          },
        },
      });

      if (!instance) throw new Error("Instance not found or access denied");

      const firstStage = instance.workflow.stages[0];

      await tx.workflowInstance.update({
        where: { id: instanceId, companyId: user.companyId },
        data: {
          completedStages: [],
          currentStageId: firstStage ? firstStage.id : null,
          status: "active",
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workflows");
  } catch (e) {
    if (e instanceof Error && e.message.includes("not found")) throw e;
    sanitizeError(e);
  }
}
