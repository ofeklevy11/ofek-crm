"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { validateUserInCompany } from "@/lib/company-validation";
import { withRetry } from "@/lib/db-retry";
import {
  createWorkflowInstanceSchema,
  instanceStatusSchema,
} from "@/lib/workflows/validation";
import { requireWorkflowUser, sanitizeError } from "@/lib/workflows/helpers";
import { inngest } from "@/lib/inngest/client";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import { createLogger } from "@/lib/logger";

const log = createLogger("WorkflowInstances");

// ── Resource caps ──────────────────────────────────────────────────────
const MAX_INSTANCES_PER_WORKFLOW = 500;

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
        select: {
          id: true,
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

        await tx.workflowInstance.update({
          where: { id: instanceId, companyId: user.companyId },
          data: {
            completedStages: currentCompleted,
            currentStageId: nextStage ? nextStage.id : null,
            status: nextStage ? "active" : "completed",
          },
        });

        return { instance, stageInfo, needsAutomation: true };
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

        return { instance, stageInfo: null, needsAutomation: false };
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));

    // Fetch stage details OUTSIDE the transaction (only if needed for automation)
    const { instance, stageInfo, needsAutomation } = result;
    if (needsAutomation && stageInfo) {
      const stageWithDetails = await prisma.workflowStage.findUnique({
        where: { id: stageInfo.id },
        select: { id: true, name: true, details: true },
      });
      const completedStage = stageWithDetails
        ? { ...stageInfo, details: stageWithDetails.details }
        : stageInfo;

      if (('details' in completedStage) && (completedStage.details as any)?.systemActions?.length) {
        try {
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
