"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

export async function getWorkflowInstances() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  return prisma.workflowInstance.findMany({
    where: { companyId: user.companyId },
    include: {
      workflow: {
        include: {
          stages: {
            orderBy: { order: "asc" },
          },
        },
      },
      assignee: true,
      creator: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createWorkflowInstance(data: {
  workflowId: number;
  name: string;
  assigneeId?: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch the workflow to find the first stage
  const workflow = await prisma.workflow.findUnique({
    where: { id: data.workflowId },
    include: { stages: { orderBy: { order: "asc" }, take: 1 } },
  });

  if (!workflow) throw new Error("Workflow not found");

  const instance = await prisma.workflowInstance.create({
    data: {
      companyId: user.companyId,
      workflowId: data.workflowId,
      name: data.name,
      creatorId: user.id,
      assigneeId: data.assigneeId,
      status: "active",
      currentStageId: workflow.stages[0]?.id || null, // Start at first stage
      completedStages: [], // None completed yet
    },
  });

  revalidatePath("/workflows");
  return instance;
}

export async function updateWorkflowInstanceStage(
  instanceId: number,
  stageId: number,
  completed: boolean
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const instance = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: {
      workflow: { include: { stages: { orderBy: { order: "asc" } } } },
    },
  });

  if (!instance) throw new Error("Instance not found");

  // Logic for checkbox:
  // If completed is true, we add stageId to completedStages.
  // We also likely need to move "currentStageId" to the NEXT stage if available.

  let currentCompleted = (instance.completedStages as number[]) || [];

  if (completed) {
    if (!currentCompleted.includes(stageId)) {
      currentCompleted.push(stageId);
    }

    // Find next stage to set as "current"
    const currentStageIndex = instance.workflow.stages.findIndex(
      (s) => s.id === stageId
    );
    const completedStage = instance.workflow.stages[currentStageIndex];
    const nextStage = instance.workflow.stages[currentStageIndex + 1];

    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: {
        completedStages: currentCompleted,
        currentStageId: nextStage ? nextStage.id : null,
        status: nextStage ? "active" : "completed", // If no next stage, mark instance as completed
      },
    });

    // TRIGGER AUTOMATION
    if (completedStage) {
      // Run in background (fire and forget pattern for response speed, though we await here for safety in this demo)
      await executeStageAutomations(completedStage, instance, user).catch((e) =>
        console.error("Automation Error:", e)
      );
    }
  } else {
    // Unchecking (Reverting)
    currentCompleted = currentCompleted.filter((id) => id !== stageId);

    // If we revert, we probably set the current stage back to this one
    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: {
        completedStages: currentCompleted,
        currentStageId: stageId,
        status: "active",
      },
    });
  }

  revalidatePath("/workflows");
}

export async function deleteWorkflowInstance(instanceId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await prisma.workflowInstance.delete({
    where: { id: instanceId },
  });

  revalidatePath("/workflows");
}

// ----------------------------------------------------------------------
// AUTOMATION EXECUTOR
// ----------------------------------------------------------------------

async function executeStageAutomations(stage: any, instance: any, user: any) {
  const details = stage.details as any;
  if (!details || !Array.isArray(details.systemActions)) return;

  console.log(
    `[Automation] Processing ${details.systemActions.length} actions for stage ${stage.name}`
  );

  for (const action of details.systemActions) {
    // Handle both legacy string actions and new structured actions
    if (typeof action === "string") {
      console.log(`[Automation] Legacy action skipped: ${action}`);
      continue;
    }

    const { type, config } = action;
    if (!type) continue;

    try {
      switch (type) {
        case "create_task":
          if (config.title) {
            await prisma.task.create({
              data: {
                companyId: user.companyId,
                title: config.title,
                status: "todo",
                assigneeId: config.assigneeId
                  ? Number(config.assigneeId)
                  : null,
                priority: config.priority || "normal",
                description: `Created automatically by workflow: ${instance.name} (Stage: ${stage.name})`,
                tags: ["automation"],
              },
            });
            console.log(`[Automation] Task created: ${config.title}`);
          }
          break;

        case "notification":
          if (config.recipientId && config.message) {
            await prisma.notification.create({
              data: {
                companyId: user.companyId,
                userId: Number(config.recipientId),
                title: "התראה מתהליך עבודה",
                message: `${config.message} (תהליך: ${instance.name})`,
                link: `/workflows`,
                read: false,
              },
            });
            console.log(
              `[Automation] Notification sent to user ${config.recipientId}`
            );
          }
          break;

        case "create_record":
          if (config.tableId) {
            // For records, we strictly need data. Since modal might not capture it fully yet, we create an empty/stub record
            // Or if we fixed the modal to save 'values' in config:
            const recordData = config.values || {};
            await prisma.record.create({
              data: {
                companyId: user.companyId,
                tableId: Number(config.tableId),
                data: recordData,
                createdBy: user.id,
              },
            });
            console.log(
              `[Automation] Record created in table ${config.tableId}`
            );
          }
          break;

        case "webhook":
          if (config.url) {
            // Fire and forget webhook
            fetch(config.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "stage_completed",
                workflow: instance.name,
                stage: stage.name,
                user: user.name,
                timestamp: new Date().toISOString(),
              }),
            }).catch((e) => console.error("Webhook failed", e));
          }
          break;
      }
    } catch (e) {
      console.error(`[Automation] Failed to execute ${type}:`, e);
    }
  }
}
