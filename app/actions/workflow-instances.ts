"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { validateUserInCompany } from "@/lib/company-validation";
import { withRetry } from "@/lib/db-retry";

export async function getWorkflowInstances(
  status?: string,
  opts?: { workflowId?: number; cursor?: number },
) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  return withRetry(() => prisma.workflowInstance.findMany({
    where: {
      companyId: user.companyId,
      ...(status ? { status } : {}),
      ...(opts?.workflowId ? { workflowId: opts.workflowId } : {}),
    },
    select: {
      id: true,
      companyId: true,
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

export async function createWorkflowInstance(data: {
  workflowId: number;
  name: string;
  assigneeId?: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // SECURITY: Validate assigneeId belongs to same company (before transaction to avoid holding it open)
  if (data.assigneeId) {
    if (!(await validateUserInCompany(data.assigneeId, user.companyId))) {
      throw new Error("Invalid assignee");
    }
  }

  // Transaction to prevent FK violation if workflow is deleted between read and create
  const instance = await withRetry(() => prisma.$transaction(async (tx) => {
    const workflow = await tx.workflow.findFirst({
      where: { id: data.workflowId, companyId: user.companyId },
      include: { stages: { orderBy: { order: "asc" }, take: 1 } },
    });

    if (!workflow) throw new Error("Workflow not found or access denied");

    return tx.workflowInstance.create({
      data: {
        companyId: user.companyId,
        workflowId: data.workflowId,
        name: data.name,
        creatorId: user.id,
        assigneeId: data.assigneeId,
        status: "active",
        currentStageId: workflow.stages[0]?.id || null,
        completedStages: [],
      },
    });
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workflows");
  return instance;
}

export async function updateWorkflowInstanceStage(
  instanceId: number,
  stageId: number,
  completed: boolean,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Transaction with Serializable isolation to prevent lost-update race on completedStages JSON array.
  // Retry once on serialization failure (P2034 / 40001) since this is a user-facing action.
  const result = await withRetry(() => prisma.$transaction(async (tx) => {
    // CRITICAL: Verify instance belongs to user's company
    // Fetch stages without bulky `details` JSON — only load details for the completed stage
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
      console.error("Failed to enqueue workflow automations:", e);
      // P7: Best-effort notification so the user knows automations didn't fire
      try {
        const { createNotificationForCompany } = await import("@/app/actions/notifications");
        await createNotificationForCompany({
          companyId: user.companyId,
          userId: user.id,
          title: "אוטומציות תהליך עבודה לא נשלחו",
          message: `האוטומציות של שלב "${completedStage.name}" בתהליך "${instance.name}" לא הצליחו להישלח. נסה שוב.`,
          link: "/workflows",
          skipValidation: true,
        });
      } catch (_) {
        // notification itself failed — nothing more we can do
      }
    }
  }

  revalidatePath("/workflows");
}

export async function resetWorkflowInstance(instanceId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Transaction to prevent read-then-write race condition
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
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workflows");
}

