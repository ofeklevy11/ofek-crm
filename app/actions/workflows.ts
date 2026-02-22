"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { validateUserInCompany } from "@/lib/company-validation";
import { withRetry } from "@/lib/db-retry";
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  createStageSchema,
  updateStageSchema,
  reorderStagesSchema,
  updateWorkflowInstanceSchema,
} from "@/lib/workflows/validation";
import { requireWorkflowUser, sanitizeError } from "@/lib/workflows/helpers";
import { logSecurityEvent, SEC_WORKFLOW_DELETED } from "@/lib/security/audit-security";

// ── Resource caps ──────────────────────────────────────────────────────
const MAX_WORKFLOWS_PER_COMPANY = 100;
const MAX_STAGES_PER_WORKFLOW = 50;

// ── Queries ────────────────────────────────────────────────────────────

export async function getWorkflows(cursor?: number) {
  const user = await requireWorkflowUser("workflowRead");
  if (cursor !== undefined && (!Number.isInteger(cursor) || cursor <= 0)) throw new Error("Invalid cursor");

  return await withRetry(() => prisma.workflow.findMany({
    where: { companyId: user.companyId },
    select: {
      id: true, name: true, description: true, color: true, icon: true,
      createdAt: true, updatedAt: true,
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
  const user = await requireWorkflowUser("workflowRead");

  if (!Number.isInteger(workflowId) || workflowId <= 0) throw new Error("Invalid workflowId");

  return withRetry(() => prisma.workflowStage.findMany({
    where: { workflowId, workflow: { companyId: user.companyId } },
    select: { id: true, details: true },
    orderBy: { order: "asc" },
  }));
}

// ── Mutations ──────────────────────────────────────────────────────────

export async function createWorkflow(data: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}) {
  const user = await requireWorkflowUser("workflowMutation");
  const parsed = createWorkflowSchema.parse(data);

  try {
    const workflow = await withRetry(() => prisma.$transaction(async (tx) => {
      // Resource cap — inside Serializable transaction to prevent TOCTOU race
      const count = await tx.workflow.count({ where: { companyId: user.companyId } });
      if (count >= MAX_WORKFLOWS_PER_COMPANY) {
        throw new Error(`Maximum of ${MAX_WORKFLOWS_PER_COMPANY} workflows reached`);
      }

      return tx.workflow.create({
        data: {
          companyId: user.companyId,
          name: parsed.name,
          description: parsed.description,
          color: parsed.color,
          icon: parsed.icon,
        },
        select: { id: true, name: true, description: true, color: true, icon: true, createdAt: true, updatedAt: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workflows");
    return workflow;
  } catch (e) {
    if (e instanceof Error && e.message.includes("Maximum")) throw e;
    sanitizeError(e);
  }
}

export async function updateWorkflow(
  id: number,
  data: { name?: string; description?: string; color?: string; icon?: string }
) {
  const user = await requireWorkflowUser("workflowMutation");
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");
  const parsed = updateWorkflowSchema.parse(data);

  try {
    const workflow = await prisma.workflow.update({
      where: { id, companyId: user.companyId },
      data: parsed,
      select: { id: true, name: true, description: true, color: true, icon: true, createdAt: true, updatedAt: true },
    });
    revalidatePath("/workflows");
    return workflow;
  } catch (e) {
    sanitizeError(e);
  }
}

export async function deleteWorkflow(id: number) {
  const user = await requireWorkflowUser("workflowMutation");
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");

  try {
    await prisma.workflow.delete({ where: { id, companyId: user.companyId } });
    logSecurityEvent({ action: SEC_WORKFLOW_DELETED, companyId: user.companyId, userId: user.id, details: { workflowId: id } });
    revalidatePath("/workflows");
  } catch (e) {
    sanitizeError(e);
  }
}

export async function createStage(
  workflowId: number,
  data: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    details?: any;
  }
) {
  const user = await requireWorkflowUser("workflowMutation");
  if (!Number.isInteger(workflowId) || workflowId <= 0) throw new Error("Invalid workflowId");
  const parsed = createStageSchema.parse(data);

  try {
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
          _count: { select: { stages: true } },
        },
      });
      if (!workflow) throw new Error("Workflow not found");

      // Resource cap
      if (workflow._count.stages >= MAX_STAGES_PER_WORKFLOW) {
        throw new Error(`Maximum of ${MAX_STAGES_PER_WORKFLOW} stages per workflow reached`);
      }

      const order = (workflow.stages[0]?.order ?? -1) + 1;

      return tx.workflowStage.create({
        data: {
          workflowId,
          order,
          name: parsed.name,
          description: parsed.description,
          color: parsed.color,
          icon: parsed.icon,
          details: parsed.details,
        },
        select: {
          id: true, workflowId: true, name: true, description: true,
          color: true, icon: true, order: true, details: true,
          createdAt: true, updatedAt: true,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workflows");
    return stage;
  } catch (e) {
    // Re-throw business-logic errors as-is; sanitize unknown ones
    if (e instanceof Error && (e.message.includes("Maximum") || e.message === "Workflow not found")) throw e;
    sanitizeError(e);
  }
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
  const user = await requireWorkflowUser("workflowMutation");
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");
  const parsed = updateStageSchema.parse(data);

  try {
    const updated = await withRetry(() => prisma.$transaction(async (tx) => {
      const stage = await tx.workflowStage.findFirst({
        where: { id, workflow: { companyId: user.companyId } },
        select: { id: true, workflowId: true },
      });
      if (!stage) throw new Error("Unauthorized or not found");

      return tx.workflowStage.update({
        where: { id, workflowId: stage.workflowId },
        data: parsed,
        select: {
          id: true, workflowId: true, name: true, description: true,
          color: true, icon: true, order: true, details: true,
          createdAt: true, updatedAt: true,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workflows");
    return updated;
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized or not found") throw e;
    sanitizeError(e);
  }
}

export async function deleteStage(id: number) {
  const user = await requireWorkflowUser("workflowMutation");
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");

  try {
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));
    revalidatePath("/workflows");
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized or not found") throw e;
    sanitizeError(e);
  }
}

export async function reorderStages(workflowId: number, orderedIds: number[]) {
  const user = await requireWorkflowUser("workflowMutation");

  // Validate inputs via Zod
  const parsed = reorderStagesSchema.parse({ workflowId, orderedIds });
  const sanitizedIds = parsed.orderedIds;

  if (sanitizedIds.length === 0) return;

  try {
    await withRetry(() => prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.findFirst({
        where: { id: parsed.workflowId, companyId: user.companyId },
        select: { id: true, stages: { select: { id: true } } },
      });
      if (!workflow) throw new Error("Workflow not found");

      // Assert orderedIds covers every stage to prevent partial reorder
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
        SET "order" = CASE "id" ${Prisma.join(cases, ` `)} END,
            "updatedAt" = NOW()
        WHERE "workflowId" = ${parsed.workflowId}
          AND "id" IN (${Prisma.join(sanitizedIds)})`;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));

    revalidatePath("/workflows");
  } catch (e) {
    if (e instanceof Error && (e.message === "Workflow not found" || e.message.includes("orderedIds"))) throw e;
    sanitizeError(e);
  }
}

export async function updateWorkflowInstance(
  id: number,
  data: { name?: string; assigneeId?: number | null }
) {
  const user = await requireWorkflowUser("workflowMutation");
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");
  const parsed = updateWorkflowInstanceSchema.parse(data);

  // SECURITY: Validate assigneeId belongs to same company
  if (parsed.assigneeId) {
    if (!(await validateUserInCompany(parsed.assigneeId, user.companyId))) {
      throw new Error("Invalid assignee");
    }
  }

  try {
    await prisma.workflowInstance.update({
      where: { id, companyId: user.companyId },
      data: parsed,
    });
    revalidatePath("/workflows");
  } catch (e) {
    sanitizeError(e);
  }
}

export async function deleteWorkflowInstance(id: number) {
  const user = await requireWorkflowUser("workflowMutation");
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");

  try {
    await prisma.workflowInstance.delete({ where: { id, companyId: user.companyId } });
    revalidatePath("/workflows");
  } catch (e) {
    sanitizeError(e);
  }
}
