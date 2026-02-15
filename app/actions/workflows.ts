"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { validateUserInCompany } from "@/lib/company-validation";
import { withRetry } from "@/lib/db-retry";

export async function getWorkflows(cursor?: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // P142: Add take limit to bound workflows query
  // Exclude bulky `details` JSON from stages — load lazily via getWorkflowStagesDetails
  return await withRetry(() => prisma.workflow.findMany({
    where: { companyId: user.companyId },
    include: {
      stages: {
        select: {
          id: true,
          workflowId: true,
          name: true,
          description: true,
          color: true,
          icon: true,
          order: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  }));
}

/** Fetch stage details (automations JSON) for all stages in a workflow — for lazy loading */
export async function getWorkflowStagesDetails(workflowId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  return withRetry(() => prisma.workflowStage.findMany({
    where: { workflowId, workflow: { companyId: user.companyId } },
    select: { id: true, details: true },
    orderBy: { order: "asc" },
  }));
}

export async function createWorkflow(data: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const workflow = await prisma.workflow.create({
    data: {
      companyId: user.companyId,
      ...data,
    },
  });

  revalidatePath("/workflows");
  return workflow;
}

export async function updateWorkflow(
  id: number,
  data: { name?: string; description?: string; color?: string; icon?: string }
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  try {
    const workflow = await prisma.workflow.update({
      where: { id, companyId: user.companyId },
      data,
    });
    revalidatePath("/workflows");
    return workflow;
  } catch (e: any) {
    if (e.code === "P2025") throw new Error("Not found");
    throw e;
  }
}

export async function deleteWorkflow(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  try {
    await prisma.workflow.delete({ where: { id, companyId: user.companyId } });
    revalidatePath("/workflows");
  } catch (e: any) {
    if (e.code === "P2025") throw new Error("Not found");
    throw e;
  }
}

export async function createStage(
  workflowId: number,
  data: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    details?: any; // JSON
  }
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Transaction with Serializable isolation to prevent duplicate order values on concurrent stage creation.
  // Retry once on serialization failure since this is a user-facing action.
  const stage = await withRetry(() => prisma.$transaction(async (tx) => {
    const workflow = await tx.workflow.findFirst({
      where: { id: workflowId, companyId: user.companyId },
      select: {
        id: true,
        stages: {
          select: { order: true },
          orderBy: { order: "desc" },
          take: 1,
        },
      },
    });
    if (!workflow) throw new Error("Workflow not found");

    const order = (workflow.stages[0]?.order ?? -1) + 1;

    return tx.workflowStage.create({
      data: {
        workflowId,
        order,
        ...data,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workflows");
  return stage;
}

export async function updateStage(
  id: number,
  data: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    details?: any;
    order?: number;
  }
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // We should verify ownership through the workflow, but for simplicity assuming ID check on update is sufficient if we trust the ID structure.
  // Ideally we join to workflow to check companyId.
  const updated = await withRetry(() => prisma.$transaction(async (tx) => {
    const stage = await tx.workflowStage.findFirst({
      where: { id, workflow: { companyId: user.companyId } },
      select: { id: true, workflowId: true },
    });
    if (!stage) throw new Error("Unauthorized or not found");

    return tx.workflowStage.update({
      where: { id, workflowId: stage.workflowId },
      data,
    });
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workflows");
  return updated;
}

export async function deleteStage(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await withRetry(() => prisma.$transaction(async (tx) => {
    const stage = await tx.workflowStage.findFirst({
      where: { id, workflow: { companyId: user.companyId } },
      select: { id: true, workflowId: true },
    });
    if (!stage) throw new Error("Unauthorized or not found");

    await tx.workflowStage.delete({ where: { id, workflowId: stage.workflowId } });

    // Clean orphaned stage IDs from completedStages in a single query (no N+1)
    await tx.$executeRaw`
      UPDATE "WorkflowInstance"
      SET "completedStages" = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements("completedStages") AS elem
        WHERE elem != to_jsonb(${id})
      ),
      "updatedAt" = NOW()
      WHERE "workflowId" = ${stage.workflowId}
        AND "completedStages" @> jsonb_build_array(${id})
    `;

    // Advance instances stuck at the deleted stage (currentStageId set to NULL by FK cascade)
    const stuckInstances = await tx.workflowInstance.findMany({
      where: { workflowId: stage.workflowId, currentStageId: null, status: "active" },
      select: { id: true },
    });
    if (stuckInstances.length > 0) {
      const nextStage = await tx.workflowStage.findFirst({
        where: { workflowId: stage.workflowId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      await tx.workflowInstance.updateMany({
        where: { id: { in: stuckInstances.map(i => i.id) } },
        data: {
          currentStageId: nextStage?.id ?? null,
          status: nextStage ? "active" : "completed",
        },
      });
    }
  }, { maxWait: 5000, timeout: 10000 }));
  revalidatePath("/workflows");
}

export async function reorderStages(workflowId: number, orderedIds: number[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (orderedIds.length === 0) return;

  // Validate all IDs are positive integers
  const sanitizedIds = orderedIds.map(Number);
  if (!sanitizedIds.every((id) => Number.isInteger(id) && id > 0)) {
    throw new Error("Invalid stage IDs");
  }

  await withRetry(() => prisma.$transaction(async (tx) => {
    const workflow = await tx.workflow.findFirst({
      where: { id: workflowId, companyId: user.companyId },
      select: { id: true, stages: { select: { id: true } } },
    });
    if (!workflow) throw new Error("Workflow not found");

    // Fix 9: Assert orderedIds covers every stage to prevent partial reorder
    // violating the unique(workflowId, order) constraint
    const existingIds = new Set(workflow.stages.map((s) => s.id));
    if (
      sanitizedIds.length !== existingIds.size ||
      !sanitizedIds.every((id) => existingIds.has(id))
    ) {
      throw new Error("orderedIds must include every stage in the workflow");
    }

    // Single UPDATE with CASE — parameterized via Prisma.sql
    const cases = sanitizedIds.map(
      (id, index) => Prisma.sql`WHEN ${id} THEN ${index}`,
    );

    await tx.$executeRaw`
      UPDATE "WorkflowStage"
      SET "order" = CASE "id" ${Prisma.join(cases, Prisma.sql` `)} END,
          "updatedAt" = NOW()
      WHERE "workflowId" = ${workflowId}
        AND "id" IN (${Prisma.join(sanitizedIds)})`;
  }, { maxWait: 5000, timeout: 10000 }));

  revalidatePath("/workflows");
}

export async function updateWorkflowInstance(
  id: number,
  data: { name?: string; assigneeId?: number | null }
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // SECURITY: Validate assigneeId belongs to same company
  if (data.assigneeId) {
    if (!(await validateUserInCompany(data.assigneeId, user.companyId))) {
      throw new Error("Invalid assignee");
    }
  }

  try {
    await prisma.workflowInstance.update({
      where: { id, companyId: user.companyId },
      data,
    });
    revalidatePath("/workflows");
  } catch (e: any) {
    if (e.code === "P2025") throw new Error("Not found");
    throw e;
  }
}

export async function deleteWorkflowInstance(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  try {
    await prisma.workflowInstance.delete({ where: { id, companyId: user.companyId } });
    revalidatePath("/workflows");
  } catch (e: any) {
    if (e.code === "P2025") throw new Error("Not found");
    throw e;
  }
}
