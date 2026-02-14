"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

export async function getWorkflows() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // P142: Add take limit to bound workflows query
  return await prisma.workflow.findMany({
    where: { companyId: user.companyId },
    include: {
      stages: {
        orderBy: { order: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
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

  // Verify ownership
  const exists = await prisma.workflow.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!exists) throw new Error("Not found");

  const workflow = await prisma.workflow.update({
    where: { id, companyId: user.companyId },
    data,
  });

  revalidatePath("/workflows");
  return workflow;
}

export async function deleteWorkflow(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const exists = await prisma.workflow.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!exists) throw new Error("Not found");

  await prisma.workflow.delete({ where: { id, companyId: user.companyId } });
  revalidatePath("/workflows");
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

  // Verify workflow ownership
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, companyId: user.companyId },
  });
  if (!workflow) throw new Error("Workflow not found");

  // get max order — scoped by companyId for defense-in-depth
  const lastStage = await prisma.workflowStage.findFirst({
    where: { workflowId, workflow: { companyId: user.companyId } },
    orderBy: { order: "desc" },
  });
  const order = (lastStage?.order ?? -1) + 1;

  const stage = await prisma.workflowStage.create({
    data: {
      workflowId,
      order,
      ...data,
    },
  });

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
  const updated = await prisma.$transaction(async (tx) => {
    const stage = await tx.workflowStage.findFirst({
      where: { id, workflow: { companyId: user.companyId } },
      select: { id: true, workflowId: true },
    });
    if (!stage) throw new Error("Unauthorized or not found");

    return tx.workflowStage.update({
      where: { id, workflowId: stage.workflowId },
      data,
    });
  });

  revalidatePath("/workflows");
  return updated;
}

export async function deleteStage(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await prisma.$transaction(async (tx) => {
    const stage = await tx.workflowStage.findFirst({
      where: { id, workflow: { companyId: user.companyId } },
      select: { id: true, workflowId: true },
    });
    if (!stage) throw new Error("Unauthorized or not found");

    await tx.workflowStage.delete({ where: { id, workflowId: stage.workflowId } });
  });
  revalidatePath("/workflows");
}

export async function reorderStages(workflowId: number, orderedIds: number[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, companyId: user.companyId },
  });
  if (!workflow) throw new Error("Workflow not found");

  const transaction = orderedIds.map((id, index) =>
    prisma.workflowStage.updateMany({
      where: { id, workflowId, workflow: { companyId: user.companyId } },
      data: { order: index },
    })
  );

  await prisma.$transaction(transaction);
  revalidatePath("/workflows");
}

export async function updateWorkflowInstance(
  id: number,
  data: { name?: string; assigneeId?: number | null }
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const instance = await prisma.workflowInstance.findFirst({
    where: { id, companyId: user.companyId },
  });

  if (!instance) throw new Error("Not found");

  await prisma.workflowInstance.update({
    where: { id, companyId: user.companyId },
    data,
  });

  revalidatePath("/workflows");
}

export async function deleteWorkflowInstance(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const instance = await prisma.workflowInstance.findFirst({
    where: { id, companyId: user.companyId },
  });

  if (!instance) throw new Error("Not found");

  await prisma.workflowInstance.delete({ where: { id, companyId: user.companyId } });
  revalidatePath("/workflows");
}
