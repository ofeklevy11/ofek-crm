"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { createNotificationForCompany } from "@/app/actions/notifications";

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

  // Fetch the workflow to find the first stage - VERIFY COMPANY OWNERSHIP
  const workflow = await prisma.workflow.findFirst({
    where: { id: data.workflowId, companyId: user.companyId },
    include: { stages: { orderBy: { order: "asc" }, take: 1 } },
  });

  if (!workflow) throw new Error("Workflow not found or access denied");

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
  completed: boolean,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // CRITICAL: Verify instance belongs to user's company
  const instance = await prisma.workflowInstance.findFirst({
    where: { id: instanceId, companyId: user.companyId },
    include: {
      workflow: { include: { stages: { orderBy: { order: "asc" } } } },
    },
  });

  if (!instance) throw new Error("Instance not found or access denied");

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
      (s) => s.id === stageId,
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
        console.error("Automation Error:", e),
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

  // CRITICAL: Verify instance belongs to user's company before deletion
  const instance = await prisma.workflowInstance.findFirst({
    where: { id: instanceId, companyId: user.companyId },
  });

  if (!instance) throw new Error("Instance not found or access denied");

  await prisma.workflowInstance.delete({
    where: { id: instanceId },
  });

  revalidatePath("/workflows");
}

export async function resetWorkflowInstance(instanceId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // CRITICAL: Verify instance belongs to user's company
  const instance = await prisma.workflowInstance.findFirst({
    where: { id: instanceId, companyId: user.companyId },
    include: {
      workflow: { include: { stages: { orderBy: { order: "asc" } } } },
    },
  });

  if (!instance) throw new Error("Instance not found or access denied");

  const firstStage = instance.workflow.stages[0];

  await prisma.workflowInstance.update({
    where: { id: instanceId },
    data: {
      completedStages: [],
      currentStageId: firstStage ? firstStage.id : null,
      status: "active",
    },
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
    `[Automation] Processing ${details.systemActions.length} actions for stage ${stage.name}`,
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
            let dueDate = undefined;
            if (
              config.dueDateOffset !== undefined &&
              config.dueDateOffset !== ""
            ) {
              dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + Number(config.dueDateOffset));
            }

            await prisma.task.create({
              data: {
                companyId: user.companyId,
                title: config.title,
                status: config.status || "todo",
                assigneeId: config.assigneeId
                  ? Number(config.assigneeId)
                  : null,
                priority: config.priority || "normal",
                description: config.description || "",
                dueDate: dueDate,
                tags: ['נוצר ע"י אוטומציה מתהליך עבודה'],
              },
            });
            console.log(`[Automation] Task created: ${config.title}`);
          }
          break;

        case "notification":
          if (config.recipientId && config.message) {
            await createNotificationForCompany({
              companyId: user.companyId,
              userId: Number(config.recipientId),
              title: "התראה מתהליך עבודה",
              message: `${config.message} (תהליך: ${instance.name})`,
              link: `/workflows`,
            });
            console.log(
              `[Automation] Notification sent to user ${config.recipientId}`,
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
              `[Automation] Record created in table ${config.tableId}`,
            );
          }
          break;

        case "update_record":
          if (config.tableId && config.recordId && config.fieldName) {
            const recordId = Number(config.recordId);
            const tableId = Number(config.tableId);

            // Fetch existing record first to get current data
            const record = await prisma.record.findFirst({
              where: {
                id: recordId,
                tableId: tableId,
                companyId: user.companyId,
              },
            });

            if (record) {
              let newData = { ...(record.data as any) };
              const field = config.fieldName;
              let val = config.value;

              // Handle numeric operations if specified (add, subtract, etc.)
              if (
                config.operation &&
                config.operation !== "set" &&
                !isNaN(Number(val))
              ) {
                const currentVal = Number(newData[field] || 0);
                const operVal = Number(val);
                switch (config.operation) {
                  case "add":
                    val = currentVal + operVal;
                    break;
                  case "subtract":
                    val = currentVal - operVal;
                    break;
                  case "multiply":
                    val = currentVal * operVal;
                    break;
                  case "divide":
                    val = operVal !== 0 ? currentVal / operVal : currentVal;
                    break;
                }
              }

              newData[field] = val;

              await prisma.record.update({
                where: { id: recordId },
                data: { data: newData },
              });
              console.log(
                `[Automation] Record ${recordId} updated: ${field} = ${val}`,
              );
            } else {
              console.log(
                `[Automation] Record ${recordId} not found for update in table ${tableId}`,
              );
            }
          }
          break;

        case "create_event":
          const now = new Date();
          let startTime = new Date(now);

          // TIMING LOGIC
          if (config.timingMode === "relative") {
            // Add hours and minutes from now
            if (config.hoursOffset)
              startTime.setHours(
                startTime.getHours() + Number(config.hoursOffset),
              );
            if (config.minutesOffset)
              startTime.setMinutes(
                startTime.getMinutes() + Number(config.minutesOffset),
              );
          } else {
            // Fixed time mode (Default)
            // 1. Add days
            if (config.daysOffset) {
              startTime.setDate(
                startTime.getDate() + Number(config.daysOffset),
              );
            }
            // 2. Set specific time if provided (e.g. "14:30")
            if (config.startTime) {
              const [hours, minutes] = config.startTime.split(":").map(Number);
              if (!isNaN(hours) && !isNaN(minutes)) {
                startTime.setHours(hours);
                startTime.setMinutes(minutes);
                startTime.setSeconds(0);
                startTime.setMilliseconds(0);
              }
            }
          }

          // DURATION LOGIC
          const duration = Number(config.duration || 60);
          const endTime = new Date(startTime);
          endTime.setMinutes(endTime.getMinutes() + duration);

          await prisma.calendarEvent.create({
            data: {
              companyId: user.companyId,
              title: config.title || "Meeting (Auto)",
              description:
                config.description || `Created by workflow: ${instance.name}`,
              startTime: startTime,
              endTime: endTime,
              color: config.color || "#3788d8",
            },
          });
          console.log(`[Automation] Event created: ${config.title}`);
          break;

        case "whatsapp":
          let target = config.phoneColumnId || "";
          if (target.startsWith("manual:")) {
            target = target.replace("manual:", "");
          } else {
            // For now we only support manual or we'd need record context
          }

          const isGroup = config.targetType === "group";

          console.log(
            `[Automation] Sending WhatsApp via GreenAPI to ${target} (${isGroup ? "Group" : "Private"})`,
          );

          try {
            const { sendGreenApiMessage, sendGreenApiFile } =
              await import("./green-api");

            if (config.messageType === "media" && config.mediaFileId) {
              // If media logic is needed in future, we check file URL here.
              await sendGreenApiMessage(
                user.companyId,
                target,
                config.content || "",
              );
            } else {
              await sendGreenApiMessage(
                user.companyId,
                target,
                config.content || "",
              );
            }

            console.log("[Automation] GreenAPI call successful");
          } catch (e) {
            console.error("[Automation] GreenAPI failed:", e);
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
