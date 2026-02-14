"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { createNotificationForCompany } from "@/app/actions/notifications";
import { validateUserInCompany } from "@/lib/company-validation";

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
    take: 1000,
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

  // SECURITY: Validate assigneeId belongs to same company
  if (data.assigneeId) {
    if (!(await validateUserInCompany(data.assigneeId, user.companyId))) {
      throw new Error("Invalid assignee");
    }
  }

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
      where: { id: instanceId, companyId: user.companyId },
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
      where: { id: instanceId, companyId: user.companyId },
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
    where: { id: instanceId, companyId: user.companyId },
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
    where: { id: instanceId, companyId: user.companyId },
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

            // SECURITY: Validate assigneeId at execution time
            let validatedAssigneeId: number | null = null;
            if (config.assigneeId) {
              const assigneeOk = await validateUserInCompany(Number(config.assigneeId), user.companyId);
              if (assigneeOk) validatedAssigneeId = Number(config.assigneeId);
            }

            await prisma.task.create({
              data: {
                companyId: user.companyId,
                title: config.title,
                status: config.status || "todo",
                assigneeId: validatedAssigneeId,
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
            const tId = Number(config.tableId);
            const targetTable = await prisma.tableMeta.findFirst({
              where: { id: tId, companyId: user.companyId },
              select: { id: true },
            });
            if (!targetTable) break;

            const recordData = config.values || {};
            await prisma.record.create({
              data: {
                companyId: user.companyId,
                tableId: tId,
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

              // SECURITY: Add companyId to prevent cross-tenant record mutation
              await prisma.record.update({
                where: { id: recordId, companyId: user.companyId },
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

          if (target) {
            // Dispatch to Inngest for retry + rate limiting instead of direct API call
            try {
              const { inngest } = await import("@/lib/inngest/client");
              await inngest.send({
                id: `wa-workflow-${user.companyId}-${target}-${stage.id}-${Math.floor(Date.now() / 5000)}`,
                name: "automation/send-whatsapp",
                data: {
                  companyId: user.companyId,
                  phone: String(target),
                  content: config.content || "",
                  messageType: config.messageType,
                  mediaFileId: config.mediaFileId,
                },
              });
              console.log(`[Automation] WhatsApp job enqueued for ${target}`);
            } catch (e) {
              console.error("[Automation] Failed to enqueue WhatsApp job:", e);
            }
          } else {
            console.warn("[Automation] WhatsApp: No phone number resolved");
          }
          break;

        case "webhook":
          if (config.url) {
            // Dispatch to Inngest for retry + rate limiting instead of direct fetch
            try {
              const { inngest } = await import("@/lib/inngest/client");
              const urlHost = (() => { try { return new URL(config.url).hostname; } catch { return "invalid"; } })();
              await inngest.send({
                id: `webhook-workflow-${user.companyId}-${stage.id}-${urlHost}-${Math.floor(Date.now() / 5000)}`,
                name: "automation/send-webhook",
                data: {
                  url: config.url,
                  companyId: user.companyId,
                  ruleId: 0,
                  payload: {
                    ruleId: 0,
                    ruleName: `Workflow: ${instance.name}`,
                    triggerType: "STAGE_COMPLETED",
                    companyId: user.companyId,
                    data: {
                      event: "stage_completed",
                      workflow: instance.name,
                      stage: stage.name,
                      user: user.name,
                    },
                  },
                },
              });
              console.log(`[Automation] Webhook job enqueued to ${config.url}`);
            } catch (e) {
              console.error("[Automation] Failed to enqueue webhook job:", e);
            }
          }
          break;
      }
    } catch (e) {
      console.error(`[Automation] Failed to execute ${type}:`, e);
    }
  }
}
